import * as t from "./t.ts";
import {
  BlockNotFoundSurprise,
  Evaluator,
  ModuleNotFoundSurprise,
  Runtime,
  SymbolNotExportedSurprise,
} from "./interface.ts";
import { runtimeCtx } from "./ctx.ts";
import { factory, Task, task as _task, Value } from "../00-base/factory.ts";
import { Surprise } from "@reframe/surprise/index.ts";
import { Specifier } from "../00-base/specifier.ts";
import { flattenValue } from "../08-linker/interface.ts";
import { measure } from "../00-base/measure.ts";

export type Importer = {
  kind: "symbol" | "export";
  path: t.SerializedSpecifier;
  name?: string;
};

type BlockSymbol = { block: t.Hash<t.linker.BlockSignature>; name: string };
type BlockReference = { specifier: t.SerializedSpecifier; name: string };
type BlockModule = Map<string, BlockValue>;
type BlockValue = BlockSymbol | BlockModule | BlockReference;

const task = <T>(label: string, perform: () => T) =>
  _task(measure(label, perform));

type Fn = (
  env: Record<string, unknown>,
  self: Record<string, unknown>,
) => (() => void | Promise<void>) | void;
type Factory = {
  fn: Map<number, Fn>;
  block: (index: number, fn: Fn) => Factory;
};
type BlockEntry =
  & {
    signature: t.Hash<t.linker.BlockSignature>;
    specifier: t.SerializedSpecifier;
    index: number;
    target: string;
    uses: Map<string, BlockValue>;
    dynamic: Map<number, { target: string; module: BlockModule }>;
    env: {
      getValue: (name: string) => Value;
      proxy: Record<string, unknown>;
    };
  }
  & (
    | { state: "pending"; next: Task<Promise<void>> }
    | { state: "hydrated"; next: Task<void> }
    | { state: "initialized"; next: Task<Promise<void>> }
    | { state: "evaluated" }
  );

export const evaluator = factory(
  class implements Evaluator {
    #blob: t.blob.BlobStorage;
    #blocks: Map<t.Hash<t.linker.BlockSignature>, BlockEntry> = new Map();

    constructor(blob: t.Factory<t.blob.BlobStorage>) {
      this.#blob = blob();
      this.runtime = measure("runtime.()", this.runtime.bind(this));
    }

    #flattenBlockValue(value: BlockValue): (BlockSymbol | BlockReference)[] {
      if (value instanceof Map) {
        return Array.from(value.values()).flatMap(this.#flattenBlockValue);
      }

      return [value];
    }

    #toBlockValue(graph: Runtime["graph"], value: t.linker.Value): BlockValue {
      return measure.work("runtime.evaluator.#toBlockValue", () => {
        if (Array.isArray(value)) {
          return new Map(
            value.map(([key, value]) =>
              [key, this.#toBlockValue(graph, value)] as const
            ),
          );
        }

        if ("specifier" in value) {
          return value;
        }

        const block = graph.blocks.get(value.block);

        if (!block) {
          throw new BlockNotFoundSurprise({
            block: value.block,
            importers: [],
          });
        }

        return {
          block: block.signature,
          name: value.name,
        };
      });
    }

    #getBlock(block: t.Hash<t.linker.BlockSignature>, importers: Importer[]) {
      const entry = this.#blocks.get(block);

      if (!entry) {
        throw new BlockNotFoundSurprise({ block, importers });
      }

      return entry;
    }

    #collectedBlocks = new Map<t.Hash<t.linker.BlockSignature>, BlockEntry[]>();

    #collectBlocks(value: BlockValue, importers: Importer[]) {
      return measure.work("runtime.evaluator.#collectBlocks", () => {
        const visited = new Set<t.Hash<t.linker.BlockSignature>>();
        const blocks: BlockEntry[] = [];

        const stack: Array<{
          block: t.Hash<t.linker.BlockSignature>;
          importers: Importer[];
        }> = this
          .#flattenBlockValue(value)
          .flatMap((value) => {
            if ("specifier" in value) {
              return [];
            }

            return [{ block: value.block, importers }];
          });

        for (const { block } of stack) {
          if (this.#collectedBlocks.has(block)) {
            return this.#collectedBlocks.get(block)!;
          }

          this.#collectedBlocks.set(block, blocks);
        }

        while (stack.length > 0) {
          const node = stack.pop()!;

          if (visited.has(node.block)) {
            continue;
          }

          visited.add(node.block);

          this.#collectedBlocks.get(node.block);

          const entry = this.#getBlock(node.block, node.importers);

          if (entry.state === "evaluated") {
            continue;
          }

          blocks.push(entry);

          // trace.push(
          //   printImporters(
          //     `[${entry.target.toUpperCase()}] <${node.block}> ${entry.specifier}`,
          //     node.importers,
          //   ),
          // );

          for (const [name, value] of entry.uses.entries()) {
            stack.push(
              ...this.#flattenBlockValue(value)
                .flatMap((value) => {
                  if ("specifier" in value) {
                    return [];
                  }

                  return {
                    block: value.block,
                    importers: [
                      ...node.importers,
                      { kind: "symbol" as const, path: entry.specifier, name },
                    ],
                  };
                }),
            );
          }
        }

        // console.log(`[collectBlocks] ${target} ${Deno.inspect(value)} ${
        //   trace
        //     // .filter((t) =>
        //     //   t.includes(
        //     //   )
        //     // )
        //     .join("\n\n\n")
        // }`);

        return blocks;
      });
    }

    async #initializeBlock(entry: BlockEntry) {
      if (entry.state === "pending") {
        await entry.next.perform();
      }

      if (entry.state === "hydrated") {
        entry.next.perform();
      }
    }

    #evaluateValue(
      value: BlockValue,
      importers: Importer[],
    ): Value {
      return measure.work("runtime.evaluator.#evaluateValue", () => {
        if (value instanceof Map) {
          const values = new Map(
            value.entries()
              .map(([key, value]) =>
                [
                  key,
                  this.#evaluateValue(value, importers),
                ] as const
              ),
          );

          return {
            current: new Proxy({}, {
              ownKeys: () => Array.from(values.keys()),

              getOwnPropertyDescriptor(_, prop) {
                const flag = typeof prop === "string" && values.has(prop);
                return { configurable: flag, enumerable: flag };
              },

              get: (_, name) => {
                if (name === "__esModule") {
                  return true;
                }

                if (name === Symbol.toStringTag) {
                  return "Module";
                }

                if (typeof name === "symbol") {
                  return undefined;
                }

                const value = values.get(name);

                if (!value) {
                  // RIGHT
                  if (name === "then") {
                    return undefined;
                  }

                  throw new SymbolNotExportedSurprise({
                    path: importers[0].path,
                    name,
                    importers: importers.slice(1),
                  });
                }

                if ("current" in value) {
                  return value.current;
                }

                if ("surprise" in value) {
                  throw value.surprise;
                }

                throw Surprise.with`uninitialized value: ${name}`;
              },

              set: (_, name) => {
                if (typeof name === "symbol") {
                  return false;
                }

                throw Surprise.with`cannot set value in a module`;
              },
            }),
          };
        }

        if ("specifier" in value) {
          const target = Specifier.deserialize(value.specifier).attributes.env;

          return new Proxy({}, {
            has: (_, key) => {
              return key === "current";
            },
            get: (_, key) => {
              if (key !== "current") {
                return undefined;
              }

              if (target === "client") {
                return runtimeCtx.use().createClientReference(
                  value.specifier,
                  value.name,
                );
              }

              if (target === "server") {
                return runtimeCtx.use().createServerReference(
                  value.specifier,
                  value.name,
                  [],
                );
              }

              if (target.startsWith("worker:")) {
                return runtimeCtx.use().createWorkerReference(
                  value.specifier,
                  value.name,
                  [],
                );
              }

              const runtime = runtimeCtx.use();
              throw Surprise
                .with`[evaluateValue] not implemented for ${value} (${target}) (${runtime.graph})`;
            },
          });
        }

        const entry = this.#getBlock(value.block, importers);

        if (entry.state !== "evaluated" && entry.state !== "initialized") {
          throw Surprise
            .with`[evaluateValue] not evaluated ${entry} ${importers}`;
        }

        // at this point the block should be evaluated
        return entry.env.getValue(value.name);
      });
    }

    #warmup(blocks: BlockEntry[]) {
      const runtime = runtimeCtx.use();

      const hashes = [] as t.Hash<string>[];
      const libs = [] as t.SerializedSpecifier[];

      for (const block of blocks) {
        if (block.state !== "pending") {
          continue;
        }

        const module = runtime.graph.modules.get(block.specifier);

        if (!module) {
          throw new ModuleNotFoundSurprise({
            specifier: block.specifier,
            importers: [],
          });
        }

        if (module.source === block.specifier) {
          // this is a library or a native module
          libs.push(block.specifier);
          continue;
        }

        // this is a regular module
        hashes.push(module.source);
      }

      return runtime.preload(hashes, libs);
    }

    async #evaluate<T>(
      target: string,
      value: BlockValue,
      importers: Importer[],
    ): Promise<T> {
      if ("specifier" in value) {
        const runtime = runtimeCtx.use();
        const module = runtime.graph.modules.get(value.specifier);

        if (!module) {
          throw new ModuleNotFoundSurprise({
            specifier: value.specifier,
            importers,
          });
        }

        const reference = module.references.get(value.name);

        if (!reference) {
          throw Surprise
            .with`[evaluate] ${value.specifier}#${value.name} is not a reference`;
        }

        return this.#evaluate<T>(
          target,
          this.#toBlockValue(runtime.graph, reference),
          [{ kind: "symbol", path: value.specifier, name: value.name }],
        );
      }

      const blocks = this.#collectBlocks(value, importers);

      await this.#warmup(blocks);

      await Promise.all(blocks.map((block) => this.#initializeBlock(block)));

      await Promise.all(blocks.map((block) => {
        if (block.state === "evaluated") {
          return;
        }

        if (block.state !== "initialized") {
          throw Surprise.with`[evaluate] ${block} is not initialized`;
        }

        return block.next.perform();
      }));

      // HIGHER ORDER SHOULD BE EVALUATED FIRST

      const result = this.#evaluateValue(value, importers);

      if ("current" in result) {
        return result.current as T;
      }

      if ("surprise" in result) {
        throw result.surprise;
      }

      throw Surprise.with`uninitialized ${runtimeCtx.use().graph} (${{
        blocks,
        target,
        value,
        importers,
      }})`;
    }

    #import<T>(
      target: string,
      specifier: t.SerializedSpecifier,
      name: string,
    ): Promise<T> {
      const runtime = runtimeCtx.use();

      const module = runtime.graph.modules.get(specifier);

      if (!module) {
        throw new ModuleNotFoundSurprise({ specifier, importers: [] });
      }

      const value = module.exports.get(name)!.get(target);

      if (!value) {
        throw new SymbolNotExportedSurprise({
          path: specifier,
          name,
          importers: [],
        });
      }

      return this.#evaluate<T>(
        target,
        this.#toBlockValue(runtime.graph, value),
        [{ kind: "export", path: specifier, name }],
      );
    }

    #globalOverrides = new Map<string | symbol, unknown>();
    #createEnv(block: t.Hash<t.linker.BlockSignature>) {
      const values = new Map<string, Value>();

      const globals = new Proxy({} as Record<string, unknown>, {
        get: (_, name) => {
          if (typeof name === "symbol") {
            return undefined;
          }

          if (this.#globalOverrides.has(name)) {
            return this.#globalOverrides.get(name);
          }

          if (name === "self" || name === "globalThis") {
            return globals;
          }

          if (name === "__webpack_chunk_load__") {
            return (chunk: t.Hash<t.linker.BlockSignature>) => {
              return runtimeCtx.use().load(chunk);
            };
          }

          if (name === "__webpack_require__") {
            return (chunk: t.Hash<t.linker.BlockSignature>) => {
              return runtimeCtx.use().require(chunk);
            };
          }

          if (name === "import") {
            const entry = this.#getBlock(block, []);

            return {
              meta: {
                path: entry.specifier,
                signature: entry.signature,
              },
            };
          }

          if (name === "dynamic") {
            return async (index: number) => {
              const entry = this.#getBlock(block, []);

              const dynamic = entry.dynamic.get(index);

              if (!dynamic) {
                throw Surprise
                  .with`missing dynamic import: ${index} (${entry.specifier})`;
              }

              const result = await this.#evaluate(
                dynamic.target,
                dynamic.module,
                [{ kind: "symbol", path: entry.specifier }],
              );

              return result;
            };
          }

          if (name === "Function") {
            return new Proxy(Function, {
              apply: () => {
                throw Surprise.with`function/eval is not allowed`;
              },
            });
          }

          if (name === "eval") {
            return new Proxy(eval, {
              apply: () => {
                throw Surprise.with`eval is not allowed`;
              },
            });
          }

          if (Reflect.has(self, name)) {
            return Reflect.get(self, name);
          }

          return undefined;
        },
        set: (_, name, value_) => {
          this.#globalOverrides.set(name, value_);
          return true;
        },
      });

      const proxy = new Proxy({} as Record<string, unknown>, {
        get: (_, name) => {
          if (typeof name === "symbol") {
            return undefined;
          }

          const value = values.get(name);

          if (value !== undefined && "current" in value) {
            return value.current;
          }

          if (value !== undefined && "surprise" in value) {
            throw value.surprise;
          }

          throw Surprise
            .with`uninitialized value: ${name} [${block}] (${
            this.#getBlock(block, []).specifier
          })`;
        },
        set: (_, name, value_) => {
          if (typeof name === "symbol") {
            return false;
          }

          const value = values.get(name);

          if (value) {
            const entry = this.#getBlock(block, []);

            const use = entry.uses.get(name);
            if (use) {
              if (use instanceof Map) {
                throw Surprise
                  .with`[set] cannot set value for ${name} (${use}, ${block}) because it is a module
                }`;
              }

              if ("specifier" in use) {
                throw Surprise
                  .with`[set] cannot set value for ${name} (${entry.specifier}) because ${use} is a reference`;
              }

              const used = this.#getBlock(use.block, [
                { kind: "symbol", path: entry.specifier, name },
              ]);

              if (used.specifier !== entry.specifier) {
                throw Surprise
                  .with`[set] cannot set value for ${name} (${block} / ${value}) because it is from ${used}`;
              }
            }

            Reflect.set(value, "current", value_);
          } else {
            values.set(name, { current: value_ });
          }

          return true;
        },
      });

      return {
        getValue: (name: string) => {
          if (!values.has(name)) {
            values.set(name, {});
          }

          return values.get(name)!;
        },
        setValue: (name: string, value: Value) => {
          const current = values.get(name);

          if (!current) {
            values.set(name, value);
            return;
          }

          if (!("current" in current) && !("surprise" in current)) {
            if ("current" in value) {
              Reflect.set(current, "current", value.current);
              Reflect.deleteProperty(current, "surprise");
            }

            if ("surprise" in value) {
              Reflect.set(current, "surprise", value.surprise);
              Reflect.deleteProperty(current, "current");
            }

            return;
          }

          throw Surprise.with`[setValue] ${name} (${
            this.#getBlock(block, [])
          })`;
        },
        proxy,
        globals,
      };
    }

    #factories = new Map<t.Hash<string>, Promise<Factory>>();
    runtime(
      linkerGraph: t.linker.Graph,
      _libraries: Map<t.Path, Record<string, unknown>>,
    ) {
      const $eval = measure(
        "runtime.eval()",
        (source: string) => new Function(source)() as (_: Factory) => Factory,
      );

      const $eval2 = measure(
        "runtime.eval()()",
        (source: string, factory: Factory) => {
          return $eval(source)(factory);
        },
      );

      const preload = measure(
        "runtime.preload()",
        (hashes: t.Hash<string>[], libs: t.SerializedSpecifier[]) => {
          const pending = new Set(
            hashes.filter((hash) => !this.#factories.has(hash)),
          );

          const blobs =
            (pending.size > 0
              ? this.#blob.readMany(Array.from(pending))
              : Promise.resolve([]))
              .then((blobs) => new Map(blobs));

          const promises = [] as Promise<unknown>[];

          for (const hash of hashes) {
            if (this.#factories.has(hash)) {
              promises.push(this.#factories.get(hash)!);
              continue;
            }

            const promise = blobs.then(async (blobs) => {
              const blob = blobs.get(hash);

              if (!blob) {
                throw Surprise
                  .with`[warmup] blob not found for ${hash}`;
              }

              const factory: Factory = {
                fn: new Map(),
                block(index, fn) {
                  factory.fn.set(index, fn);
                  return factory;
                },
              };

              const source = await blob.text();

              return $eval2(source, factory);
            }).catch((error) => {
              this.#factories.delete(hash);
              throw error;
            });

            this.#factories.set(hash, promise);
            promises.push(promise);
          }

          for (const specifier of libs) {
            const deserialized = Specifier.deserialize(specifier);

            if (this.#factories.has(specifier as t.Hash<string>)) {
              continue;
            }

            const factory: Factory = {
              fn: new Map(),
              block(index, fn) {
                factory.fn.set(index, fn);
                return factory;
              },
            };

            if (deserialized.scheme === "lib") {
              const lib = _libraries.get(deserialized.path);

              if (!lib) {
                throw new ModuleNotFoundSurprise({
                  specifier,
                  importers: [],
                });
              }

              this.#factories.set(
                specifier as t.Hash<string>,
                Promise.resolve(
                  factory.block(0, (Env) => {
                    for (const key of Object.keys(lib)) {
                      Env[key] = lib[key];
                    }
                  }),
                ),
              );

              continue;
            }

            if (deserialized.scheme === "node") {
              const name = deserialized.path.slice(1);
              this.#factories.set(
                specifier as t.Hash<string>,
                Promise.resolve(
                  factory.block(0, (Env) => {
                    return async () => {
                      if (typeof Deno !== "undefined") {
                        const module = await import(`node:${name}`);
                        for (const key of Object.keys(module)) {
                          Env[key] = module[key];
                        }
                        Env["*"] = module;
                      } else {
                        Env["*"] = {
                          __esModule: true,
                        };
                        Env.default = undefined;
                      }
                    };
                  }),
                ),
              );

              continue;
            }

            throw new ModuleNotFoundSurprise({
              specifier,
              importers: [],
            });
          }

          return Promise.all(promises).then(() => {
            // do nothing
          });
        },
      );

      const graph: Runtime["graph"] = {
        ...linkerGraph,
        blocks: new Map(
          linkerGraph.blocks.map(([index, block]): [number, t.linker.Block] => [index, block]),
        ),
        modules: new Map(linkerGraph.modules.map(([specifier, module]): [t.SerializedSpecifier, Runtime["graph"]["modules"] extends Map<unknown, infer V> ? V : never] => [
          specifier,
          {
            blocks: new Map(module.blocks),
            references: new Map(module.references),
            source: module.source,
            exports: new Map(
              module.exports.map(([name, value]): [string, Map<string, t.linker.Value>] => [
                name,
                new Map(value),
              ]),
            ),
          },
        ])),
        order: new Map(linkerGraph.order),
      };

      for (const [index, block] of graph.blocks.entries()) {
        if (this.#blocks.has(block.signature)) {
          continue;
        }

        const env = this.#createEnv(block.signature);

        const hydrate = task("runtime.hydrate", async () => {
          const module = graph.modules.get(block.specifier);

          if (!module) {
            throw new ModuleNotFoundSurprise({
              specifier: block.specifier,
              importers: [],
            });
          }

          const factory = await this.#factories.get(module.source);

          if (!factory) {
            throw Surprise
              .with`[hydrate] module is not preloaded: ${module.source}`;
          }

          const fn = factory.fn.get(block.index);
          if (!fn) {
            throw Surprise
              .with`block was not found in its module: ${block} ${factory}`;
          }

          entry.state = "hydrated";
          Reflect.set(
            entry,
            "next",
            task("runtime.initialize", () => {
              const evaluate = fn(env.proxy, env.globals);
              entry.state = "initialized";
              Reflect.set(
                entry,
                "next",
                task("runtime.evaluate", async () => {
                  const order = graph.order.get(index)!;

                  const uses = block.uses
                    .flatMap(([, value]) => Array.from(flattenValue(value)))
                    .flatMap((value) => {
                      if (
                        value.kind === "reference" ||
                        graph.order.get(value.symbol.block)! < order
                      ) {
                        return [];
                      }

                      const signature =
                        graph.blocks.get(value.symbol.block)!.signature;

                      const used = this.#getBlock(signature, [
                        { kind: "symbol", path: entry.specifier },
                      ])!;

                      if (used.state === "evaluated") {
                        return [];
                      }

                      if (used.target !== entry.target) {
                        return [];
                      }

                      return [used];
                    });

                  await Promise.all(
                    uses.map((block) => {
                      if (block.state !== "initialized") {
                        throw Surprise.with`entry is not initialized: ${block}`;
                      }

                      return block.next.perform();
                    }),
                  );

                  for (const [name, value] of entry.uses.entries()) {
                    env.setValue(
                      name,
                      this.#evaluateValue(
                        value,
                        [{ kind: "symbol", path: block.specifier }],
                      ),
                    );
                  }

                  await evaluate?.();

                  entry.state = "evaluated";
                  Reflect.deleteProperty(entry, "next");
                }) satisfies (BlockEntry & { state: "initialized" })["next"],
              );
            }) satisfies (BlockEntry & { state: "hydrated" })["next"],
          );
        });

        const entry: BlockEntry = {
          signature: block.signature,
          specifier: block.specifier,
          index: block.index,
          target: block.target,
          uses: new Map(),
          dynamic: new Map(),
          env,
          state: "pending",
          next: hydrate,
        };

        for (const [name, value] of block.uses) {
          entry.uses.set(name, this.#toBlockValue(graph, value));
        }

        for (const [index, [target, module]] of block.dynamic.entries()) {
          entry.dynamic.set(index, {
            target,
            module: this.#toBlockValue(graph, module) as BlockModule,
          });
        }

        this.#blocks.set(block.signature, entry);
      }

      return {
        graph,
        import: <T>(target: string, specifier: Specifier, name: string) =>
          this.#import<T>(
            target,
            new Specifier(
              specifier.scheme,
              specifier.path,
              { ...specifier.attributes, env: target },
            ).serialize(),
            name,
          ),
        preload,
        $evaluate: <T>(
          target: string,
          specifier: t.SerializedSpecifier,
          name: string,
        ) => {
          return this.#evaluate<T>(target, { specifier, name }, []);
        },
        evaluate: <T>(
          target: string,
          block: t.Hash<t.linker.BlockSignature>,
          name: string,
        ) => {
          return this.#evaluate<T>(target, { block, name }, []);
        },
      } satisfies Runtime;
    }
  },
);
