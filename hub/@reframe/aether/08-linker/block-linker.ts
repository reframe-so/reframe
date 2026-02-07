import * as t from "./t.ts";
import { SCC } from "../00-base/utils/scc.ts";
import { factory } from "./t.ts";
import * as I from "./interface.ts";
import { SymbolNotFoundSurprise } from "./interface.ts";
import { sign } from "./scc-signature.ts";

type FutureValue = Promise<
  | I.Symbol
  | I.Reference
  | Map<string, FutureValue>
>;

type AwaitedValue<T extends FutureValue> = T extends Promise<infer U>
  ? U extends I.Symbol ? U
  : U extends I.Reference ? U
  : U extends Map<string, infer V extends FutureValue>
    ? Array<[string, AwaitedValue<V>]>
  : never
  : never;

type Ctx = {
  blockCount: number;

  modules: Map<t.SerializedSpecifier, {
    blocks: Map<number, number>;
    entry: Promise<I.EntrySource>;
    exports: Map<
      string,
      Map<string, FutureValue>
    >;
    references: Map<string, FutureValue>;
  }>;
  blocks: Map<number, {
    specifier: t.SerializedSpecifier;
    index: number;
    target: string;

    uses: Map<string, FutureValue>;
    dynamic: Array<[string, Promise<Map<string, FutureValue>>]>;
    references: Array<{
      specifier: t.SerializedSpecifier;
      path: string;
    }>;
  }>;

  read: (specifier: t.SerializedSpecifier) => Promise<I.EntrySource>;
};

export const block = factory(
  class implements I.Linker {
    #getModule(ctx: Ctx, specifier: t.SerializedSpecifier, importers: I.Importer[]) {
      const module = ctx.modules.get(specifier);
      if (module) return module;

      const entry = ctx.read(specifier).catch((e) => {
        if (e instanceof t.npm.NotFoundSurprise) {
          throw new I.NotFoundSurprise({
            specifier,
            importers,
          });
        }
        throw e;
      });

      ctx.modules.set(specifier, {
        blocks: new Map(),
        entry,
        exports: new Map(),
        references: new Map(),
      });
      return ctx.modules.get(specifier)!;
    }

    #followSymbol(
      ctx: Ctx,
      target: string,
      specifier: t.SerializedSpecifier,
      name: string,
      importers: Array<I.Importer>,
    ): FutureValue {
      const module = this.#getModule(ctx, specifier, importers);

      const promise = module.entry.then((entry) => {
        const symbol = entry.symbols.get(name);

        if (!symbol) {
          throw t.Surprise
            .with`can not find symbol ${name} (in ${specifier}) (${entry})`;
        }

        if (symbol.kind === "import") {
          return this.#followExport(ctx, target, symbol.from, symbol.name, [
            ...importers,
            { kind: "symbol", specifier, name },
          ]);
        }

        const block = entry.blocks[symbol.block];

        if (!block) {
          throw t.Surprise
            .with`can not find block #${symbol.block} of ${name} (in ${specifier})`;
        }

        if (block.target !== target) {
          const deserialized = t.Specifier.deserialize(specifier);
          const sibling = new t.Specifier(
            deserialized.scheme,
            deserialized.path,
            { ...deserialized.attributes, env: block.target },
          ).serialize();

          this.#getModule(ctx, sibling, importers).references.set(
            name,
            this.#followSymbol(ctx, block.target, sibling, name, [
              ...importers,
              { kind: "reference", specifier, name },
            ]),
          );

          return { specifier: sibling, name };
        }

        let index = module.blocks.get(symbol.block);
        if (index === undefined) {
          index = ctx.blockCount++;
          module.blocks.set(symbol.block, index);
          const uses = new Map<string, FutureValue>();

          const dynamic = [] as Array<
            [string, Promise<Map<string, FutureValue>>]
          >;

          ctx.blocks.set(index, {
            specifier,
            index: symbol.block,
            target: block.target,
            uses,
            dynamic,
            references: [],
          });

          for (const use of block.uses) {
            const used = entry.symbols.get(use);

            if (!used) {
              throw t.Surprise
                .with`can not find symbol ${name} (in ${specifier})`;
            }

            if (used.kind === "import") {
              uses.set(
                use,
                this.#followExport(ctx, target, used.from, used.name, [
                  ...importers,
                  { kind: "symbol", specifier, name },
                ]),
              );
            } else {
              uses.set(
                use,
                this.#followSymbol(ctx, target, specifier, use, [
                  ...importers,
                  { kind: "symbol", specifier, name },
                ]),
              );
            }
          }

          for (const index of block.dynamic) {
            const dynamicImport = entry.dynamicImports[index];

            if (!dynamicImport) {
              throw t.Surprise
                .with`can not find dynamic import #${index} (in ${specifier})`;
            }

            const dynamicTarget = dynamicImport.target ?? target;

            if (dynamicImport.symbols === "*") {
              const value = this.#followExport(
                ctx,
                dynamicTarget,
                dynamicImport.specifier,
                "*",
                [...importers, { kind: "symbol", specifier, name }],
              )
                .then((value) => {
                  if (!(value instanceof Map)) {
                    throw t.Surprise
                      .with`unexpected single value for * (in ${specifier})`;
                  }

                  return value;
                });

              dynamic.push([dynamicTarget, value]);
            } else {
              const many = new Map<string, FutureValue>();
              for (const symbol of dynamicImport.symbols) {
                many.set(
                  symbol,
                  this.#followExport(
                    ctx,
                    dynamicTarget,
                    dynamicImport.specifier,
                    symbol,
                    [
                      ...importers,
                      { kind: "symbol", specifier, name },
                    ],
                  ),
                );
              }

              dynamic.push([target, Promise.resolve(many)]);
            }
          }
        }

        return { block: index, name };
      });

      return promise;
    }

    #followExport(
      ctx: Ctx,
      target: string,
      specifier: t.SerializedSpecifier,
      name: string,
      importers: Array<I.Importer>,
    ): FutureValue {
      const module = this.#getModule(ctx, specifier, importers);

      if (module.exports.has(name)) {
        if (module.exports.get(name)!.has(target)) {
          return module.exports.get(name)!.get(target)!;
        }
      } else {
        module.exports.set(name, new Map());
      }

      const promise = module.entry.then((entry) => {
        const exports = entry.exports;

        const export_ = exports.get(name);
        if (!export_) {
          if (name === "*") {
            const many = new Map<string, FutureValue>();

            for (const name of exports.keys()) {
              many.set(
                name,
                this.#followExport(ctx, target, specifier, name, importers),
              );
            }

            const many2 = entry.reexports
              .map((next) =>
                [
                  next,
                  this.#followExport(ctx, target, next, "*", [
                    ...importers,
                    { kind: "export", specifier, name },
                  ]),
                ] as const
              );

            return Promise.all(
              [[specifier, Promise.resolve(many)] as const, ...many2]
                .map(async ([specifier, future]) => [specifier, await future]),
            )
              .then((maps) =>
                maps
                  .map(([specifier, map]) => {
                    if (!(map instanceof Map)) {
                      throw t.Surprise
                        .with`unexpected single value for * (in ${specifier})`;
                    }

                    return map;
                  })
                  .reduce((acc, map) => {
                    for (const [name, value] of map.entries()) {
                      if (acc.has(name)) {
                        throw t.Surprise
                          .with`duplicate export ${name} (in ${specifier})`;
                      }

                      acc.set(name, value);
                    }

                    return acc;
                  })
              );
          }

          const options = (entry.reexports ?? [])
            .map((next) =>
              this.#followExport(ctx, target, next, name, [
                ...importers,
                { kind: "export", specifier, name },
              ])
            );

          return Promise.allSettled(options)
            .then((results) => {
              let value:
                | Awaited<FutureValue>
                | null = null;
              for (const result of results) {
                if (result.status === "fulfilled") {
                  if (value) {
                    throw t.Surprise
                      .with`duplicate export ${name} (in ${specifier})`;
                  }

                  value = result.value;
                } else if (!(result.reason instanceof SymbolNotFoundSurprise)) {
                  throw result.reason;
                }
              }

              if (!value) {
                throw new SymbolNotFoundSurprise({
                  specifier,
                  name,
                  importers, // RIGHT
                });
              }

              return value;
            });
        }

        if (export_.kind === "import") {
          return this.#followExport(ctx, target, export_.from, export_.name, [
            ...importers,
            { kind: "export", specifier, name },
          ]);
        }

        return this.#followSymbol(ctx, target, specifier, export_.symbol, [
          ...importers,
          { kind: "export", specifier, name },
        ]);
      });

      module.exports.get(name)!.set(target, promise);

      return promise;
    }

    #trim() {
      // RIGHT:
      // start from entry, and trim all unreachables blocks
    }

    #resolveValue<T extends FutureValue>(value: T): Promise<AwaitedValue<T>> {
      return value.then(async (resolved) => {
        if (resolved instanceof Map) {
          const entries = await Promise.all(
            resolved.entries().map(async ([key, val]) => {
              const subValue = await this.#resolveValue(val);
              return [key, subValue] as const;
            }),
          );
          return entries as AwaitedValue<T>;
        }
        return resolved as AwaitedValue<T>;
      });
    }

    async #buildGraph(
      ctx: Ctx,
      entry: {
        specifier: t.Specifier;
        export: string; // TODO: should be a symbol
        targets: Array<string>;
      },
    ): Promise<I.Graph> {
      const blocks = new Map<number, Omit<I.Block, "signature">>();

      const scc = new SCC<number>();

      const queue = await Promise.all(
        entry.targets.map(
          (target) =>
            this.#resolveValue(
              this.#followExport(
                ctx,
                target,
                new t.Specifier(
                  entry.specifier.scheme,
                  entry.specifier.path,
                  {
                    ...entry.specifier.attributes,
                    env: target,
                  },
                ).serialize(),
                entry.export,
                [],
              ),
            ),
        ),
      ).then((values) => values.flatMap((value) => I.flattenValue(value)));

      while (queue.length > 0) {
        const leaf = queue.pop()!;

        if (leaf.kind === "reference") {
          const module = this.#getModule(ctx, leaf.reference.specifier, []);
          const reference = module.references.get(leaf.reference.name);

          if (!reference) {
            throw t.Surprise
              .with`can not find reference ${leaf.reference.name} (in ${leaf.reference.specifier})`;
          }

          const value = await this.#resolveValue(reference);
          queue.push(...I.flattenValue(value));
          continue;
        }

        if (blocks.has(leaf.symbol.block)) continue;
        scc.addNode(leaf.symbol.block);

        const block = ctx.blocks.get(leaf.symbol.block);
        if (!block) {
          throw t.Surprise.with`can not find block #${leaf.symbol.block}`;
        }

        const resolve = async <T extends FutureValue>(promise: T) => {
          const value = await this.#resolveValue(promise);
          const imports = I.flattenValue(value);
          for (const import_ of imports) {
            if (import_.kind === "symbol") {
              scc.addEdge(
                leaf.symbol.block,
                import_.symbol.block,
                import_.path.join("."),
              );
            } else {
              block.references.push({
                specifier: import_.reference.specifier,
                path: import_.path.join("."),
              });
            }

            queue.push(import_);
          }

          return value;
        };

        const uses = await resolve(Promise.resolve(block.uses));

        const dynamic = [] as Array<[string, I.Many]>;
        for (const [target, promise] of block.dynamic) {
          dynamic.push([target, await resolve(promise)]);
        }

        blocks.set(leaf.symbol.block, {
          specifier: block.specifier,
          index: block.index,
          target: block.target,
          uses,
          dynamic,
        });
      }

      const modules: I.Graph["modules"] = [];
      for (const [specifier, module] of ctx.modules.entries()) {
        const exports = new Map<string, Map<string, I.Value>>();
        const references = new Map<string, I.Value>();
        for (const [name, map] of module.exports.entries()) {
          if (name === "*") {
            continue;
          }
          exports.set(
            name,
            new Map(
              await Promise.allSettled(
                map.entries().map(async ([target, promise]) => {
                  return [target, await this.#resolveValue(promise)] as const;
                }),
              ).then((results) =>
                results.flatMap((result) => {
                  if (result.status === "fulfilled") {
                    return [result.value];
                  }

                  if (result.reason instanceof SymbolNotFoundSurprise) {
                    return [];
                  }

                  throw result.reason;
                })
              ),
            ),
          );
        }

        for (const [name, promise] of module.references.entries()) {
          try {
            references.set(name, await this.#resolveValue(promise));
          } catch (e) {
            if (e instanceof SymbolNotFoundSurprise) {
              continue;
            }
            throw e;
          }
        }

        modules.push([specifier, {
          blocks: Array.from(module.blocks),
          source: (await module.entry).hash,
          exports: Array.from(
            exports.entries().map(
              ([key, value]): [string, Array<[string, I.Value]>] => [key, Array.from(value.entries())],
            ),
          ),
          references: Array.from(references.entries()),
        }]);
      }

      const encoder = new TextEncoder();
      const signatures = await sign(
        scc,
        new Map(
          await Promise.all(
            blocks.entries().map(async ([id, block]) => {
              const entry = await ctx.modules.get(block.specifier)!.entry;
              return [id, {
                path: block.specifier,
                index: block.index,
                source: entry.hash,
                references: ctx.blocks.get(id)!.references,
                reframe: "0.0.0" as t.Hash<string>,
              }] as const;
            }),
          ),
        ),
        <T>(content: T) =>
          t.crypto.subtle.digest(
            "BLAKE3",
            encoder.encode(JSON.stringify(content)),
          )
            .then((hash) => t.encodeBase64(hash).slice(0, 16) as t.Hash<T>),
      );

      return {
        version: 1,
        modules,
        blocks: Array.from(
          blocks.entries().map(([id, block]): [number, I.Block] => [
            id,
            { ...block, signature: signatures.get(id)! },
          ]),
        ),
        order: Array.from(
          blocks.keys().map((id): [number, number] => [id, scc.order(id)]),
        ),
      };
    }

    link(
      _current: I.Graph | null,
      entry: {
        specifier: t.Specifier;
        export: string;
        targets: Array<string>;
      },
      read: (specifier: t.SerializedSpecifier) => Promise<I.EntrySource>,
    ): Promise<I.Graph> {
      return this.#buildGraph({
        blockCount: 0,
        modules: new Map(),
        blocks: new Map(),
        read,
      }, entry);
    }
  },
);
