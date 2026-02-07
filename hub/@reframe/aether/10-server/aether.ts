import * as t from "./t.ts";
import { Server } from "./interface.ts";
import { runtimeCtx } from "../09-evaluator/ctx.ts";
import { Snapshot } from "./snapshot.ts";
import { measure } from "../00-base/measure.ts";

const entry = new t.Specifier("yan", "/~entry.ts", {});

export const aether = t.factory(
  class implements Server {
    id: number;
    #evaluator: t.evaluator.Evaluator;
    #yan: t.yan.Yan;
    #ctx:
      & t.context.Consumer<{
        org: string;
        frame: string;
        branch: string;
        detached?: boolean;
        workingTree: t.yan.WorkingTree;
        packageManager: t.npm.PackageManager;
        snapshot: t.Hash<Snapshot>;
        head: t.Hash<t.yan.Commit> | null;
      }>
      & t.context.Provider<{
        org: string;
        frame: string;
        branch: string;
        config: t.Hash<t.Config>;
      }>;
    #reader: t.reader.Reader;
    #linker: t.linker.Linker;
    #blob: t.blob.BlobStorage;
    #typescript: t.Factory<t.lang.TypeScriptProject>;
    #runtime: Promise<t.evaluator.Runtime>;

    constructor(
      evaluator: t.Factory<t.evaluator.Evaluator>,
      _: {
        ctx:
          & t.context.Consumer<{
            org: string;
            frame: string;
            branch: string;
            workingTree: t.yan.WorkingTree;
            packageManager: t.npm.PackageManager;
            snapshot: t.Hash<Snapshot>;
            head: t.Hash<t.yan.Commit> | null;
          }>
          & t.context.Provider<{
            org: string;
            frame: string;
            branch: string;
            config: t.Hash<t.Config>;
          }>;
        yan: t.Factory<t.yan.Yan>;
        reader: t.Factory<t.reader.Reader>;
        linker: t.Factory<t.linker.Linker>;
        blob: t.Factory<t.blob.BlobStorage>;
        typescript: t.Factory<t.lang.TypeScriptProject>;
        branch: string;
      },
    ) {
      this.#evaluator = evaluator();
      this.#yan = _.yan();
      this.#ctx = _.ctx;
      this.#reader = _.reader();
      this.#linker = _.linker();
      this.#blob = _.blob();
      this.#typescript = _.typescript;
      this.id = Math.floor(Math.random() * 1000);

      this.#runtime = this.#ctx.with({
        org: "reframe",
        frame: "aether",
        branch: _.branch,
        config: {} as t.Hash<t.Config>,
      }, () => {
        const ctx = this.#ctx.use();

        return this.#withGraph(entry, async ({ graph }) => {
          const runtime = this.#evaluator.runtime(
            graph,
            new Map([
              ["/yan", {
                yan: this.#yan,
                branch: [ctx.org, ctx.frame, ctx.branch],
              }],
              ["/ctx", {
                ...ctx,
                typecheck: (org: string, frame: string, branch: string) =>
                  this.#typeCheck(org, frame, branch),
                Surprise: t.Surprise,
                blob: this.#blob,
                yan: this.#yan,
                runtime: runtimeCtx,
                env: {},
                db: t.db,
                shapes: t.shapes,
                Blob: t.Blob,
                measure: measure,
                sync: {
                  server: t.sync.server(() => this.#yan, () => this.#blob)(),
                  serve: t.sync.serve,
                },
              }],
            ]),
          );

          return runtime;
        });
      });
    }

    #graphCache = new Map<
      t.Hash<Snapshot>,
      Promise<{
        graph: t.linker.Graph;
        serialized: Uint8Array<ArrayBuffer>;
      }>
    >();

    #getGraph(entry: t.Specifier) {
      const { snapshot } = this.#ctx.use();

      if (this.#graphCache.has(snapshot)) {
        return this.#graphCache.get(snapshot)!;
      }

      this.#graphCache.set(
        snapshot,
        this.#link(entry)
          .then((graph) => {
            const serialized = new TextEncoder().encode(JSON.stringify(graph));
            return {
              graph,
              serialized,
            };
          })
          .catch((error) => {
            this.#graphCache.delete(snapshot);
            throw error;
          }),
      );

      return this.#graphCache.get(snapshot)!;
    }

    async #createImportMap(
      importer: t.Specifier,
      source: t.compiler.Source,
    ) {
      const importMap: Record<string, t.SerializedSpecifier> = {};

      const resolve = async (
        specifier: string,
        attributes: Record<string, string>,
      ) => {
        const next = await this.#reader.resolve(
          specifier,
          attributes,
          importer,
        );

        const serialized = next.serialize();
        importMap[
          new t.Specifier(
            "i",
            `/${specifier}`,
            attributes,
          ).serialize()
        ] = serialized;

        return serialized;
      };

      const symbolEntriesPromise = source.symbols
        .map(
          async ([name, def]): Promise<[
            string,
            t.linker.EntrySymbol,
          ]> => {
            if (def.kind === "local") {
              return [name, { kind: "local", block: def.block }];
            }

            return [name, {
              kind: "import",
              name: def.name,
              from: await resolve(def.specifier, def.attributes),
            }];
          },
        );

      const exportsEntriesPromise = source.exports.map(
        async ([name, def]) => {
          if (def.kind === "local") {
            return [name, { kind: "local", symbol: def.symbol }] as [
              string,
              t.linker.EntryExport,
            ];
          }

          return [name, {
            kind: "import",
            name: def.name,
            from: await resolve(def.specifier, def.attributes),
          }] as [string, t.linker.EntryExport];
        },
      );

      const dynamicImportsPromise = source.dynamicImports.map(
        async (def): Promise<t.linker.DynamicImport> => {
          return {
            specifier: await resolve(def.specifier, def.attributes),
            symbols: def.symbols,
            target: def.target,
          };
        },
      );

      const reexportsPromise = source.reexports.map(
        async (def) => {
          return await resolve(def.specifier, def.attributes);
        },
      );

      const [
        symbols,
        exports,
        dynamicImports,
        reexports,
      ] = await Promise.all([
        Promise.all(symbolEntriesPromise).then((entries) => new Map(entries)),
        Promise.all(exportsEntriesPromise).then((entries) => new Map(entries)),
        Promise.all(dynamicImportsPromise),
        Promise.all(reexportsPromise),
      ]);

      return {
        importMap,
        symbols,
        exports,
        dynamicImports,
        reexports,
      };
    }

    #link(entry: t.Specifier): Promise<t.linker.Graph> {
      return this.#linker.link(
        null,
        { specifier: entry, export: "*", targets: ["server", "client"] },
        async (serialized: t.SerializedSpecifier) => {
          const specifier = t.Specifier.deserialize(serialized);
          const target = specifier.attributes.env;

          if (!target) {
            throw t.Surprise.with`no target: ${specifier}`;
          }

          if (specifier.scheme === "lib" || specifier.scheme === "node") {
            return {
              hash: serialized as t.Hash<string>,
              symbols: {
                get: () => ({
                  kind: "local",
                  block: 0,
                } satisfies t.linker.EntrySymbol),
                has: () => true,
              } as {} as Map<string, t.linker.EntrySymbol>,
              exports: {
                get: (
                  key: string,
                ) => ({
                  kind: "local",
                  symbol: key,
                } satisfies t.linker.EntryExport),
                has: () => true,
              } as {} as Map<string, t.linker.EntryExport>,
              dynamicImports: [],
              blocks: [{
                target,
                uses: [],
                dynamic: [],
              }],
              reexports: [],
            } satisfies t.linker.EntrySource;
          }

          const blob = await this.#reader.read<t.compiler.Source>(
            new t.Specifier("compile", serialized, {}),
          );

          const source = await blob.json() as t.compiler.Source;

          const hash = source.content as t.Hash<string>;

          const { symbols, exports, dynamicImports, reexports } = await this
            .#createImportMap(specifier, source);

          return {
            hash,

            symbols,
            exports,
            dynamicImports,
            reexports,

            blocks: source.blocks,
          } satisfies t.linker.EntrySource;
        },
      );
    }

    async #withGraph<T>(
      entry: t.Specifier,
      callback: (graph: {
        graph: t.linker.Graph;
        serialized: Uint8Array<ArrayBuffer>;
      }) => Promise<T>,
    ): Promise<T> {
      const graph = await this.#getGraph(entry);

      const push = async () => {
        try {
          const ctx = this.#ctx.use();

          if (ctx.packageManager.dirty()) {
            const deps = ctx.packageManager.graph();
            ctx.packageManager.clean();

            await ctx.workingTree.write(
              "/~/deps.lock",
              new t.Blob(JSON.stringify(deps)),
            );
          }

          if (
            !ctx.workingTree.fresh && !ctx.workingTree.pushing && !ctx.detached
          ) {
            const newHead = await this.#yan.write(
              ctx.head,
              ctx.workingTree,
              `built at ${new Date().toLocaleDateString()}`,
            );

            await this.#yan.push(
              [ctx.org, ctx.frame, ctx.branch],
              newHead,
            );

            console.log(`[push] @${ctx.org}/${ctx.frame}^${ctx.branch}`);
          }
        } catch (error) {
          console.error("[push] [error]", error);
        }
      };

      const [result] = await Promise.allSettled([callback(graph), push()]);

      if (result.status === "fulfilled") {
        return result.value;
      }

      throw result.reason;
    }

    #typeCheck(org: string, frame: string, branch: string) {
      return this.#ctx.with({
        org,
        frame,
        branch,
        config: {} as t.Hash<t.Config>,
      }, async () => {
        const ts = this.#typescript();
        await ts.initialize();
        return ts.getAllDiagnostics();
      });
    }

    fetch(request: Request): Promise<Response> {
      return t.tracer.trace("fetch", async () => {
        const url = new URL(request.url);

        if (url.pathname.startsWith("/graph")) {
          const [, org, frame, branch, config] = url.pathname.slice(
            "/graph".length,
          ).split("/");

          if (!org || !frame || !branch || !config) {
            throw t.Surprise
              .with`invalid path: ${url.pathname}, ${org}, ${frame}, ${branch}, ${config}`;
          }

          return this.#ctx.with({
            org: org.slice(1),
            frame,
            branch,
            config: {} as t.Hash<t.Config>,
          }, () =>
            this.#withGraph(
              entry,
              async ({ serialized }) => new Response(serialized),
            ));
        }

        // GET /b/<hash> - single blob
        if (url.pathname.startsWith("/b/")) {
          const hash = url.pathname.slice("/b/".length);
          const { body, metadata } = await this.#blob.read(
            hash as t.Hash<unknown>,
          );
          return new Response(body, { headers: metadata });
        }

        // POST /b - multiple blobs
        if (url.pathname === "/b" && request.method === "POST") {
          const hashes = await request.json();
          const result = await this.#blob.readMany(hashes);
          const output = await Promise.all(
            result.map(async ([hash, blob]) => [
              hash,
              {
                content: await blob.text(),
                metadata: blob.metadata,
              },
            ]),
          );
          return Response.json(output);
        }

        return await this.#runtime.then((runtime) =>
          runtimeCtx.with(runtime, async () => {
            const result = await runtime.import<{
              serve: (request: Request) => Promise<Response>;
            }>("server", entry, "default");

            const response = await result.serve(request);

            if (response instanceof Response) {
              return response;
            }

            throw t.Surprise.with`not a response: ${response}`;
          })
        );
      });
    }
  },
);
