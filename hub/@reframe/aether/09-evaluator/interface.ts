import type * as t from "./t.ts";
import { Surprise } from "@reframe/surprise/index.ts";
import { printTree } from "@reframe/surprise/utils.ts";

type Importer = {
  kind: "symbol" | "export";
  path: t.Path;
  name?: string;
};

export const printImporters = (message: string, importers: Importer[]) =>
  printTree([
    message,
    [...importers.reverse()]
      .map((
        importer,
      ) => [
        `${importer.kind}${
          importer.name ? `:${importer.name}` : ""
        } (${importer.path})`,
        [],
      ]),
  ]);

export class EvaluatorSurprise extends Surprise.extend<{
  importers: Importer[];
}>("evaluator", (ctx) => printImporters("", ctx.importers)) {}

/**
 * Thrown when a module is not found in the evaluator's libraries
 */
export class ModuleNotFoundSurprise extends EvaluatorSurprise.extend<{
  specifier: t.SerializedSpecifier;
  alternatives?: string[];
}>(
  "module-not-found",
  (ctx) => {
    const baseMessage = `module not found: ${ctx.specifier}`;

    if (ctx.alternatives && ctx.alternatives.length > 0) {
      return `${baseMessage}. did you mean ${ctx.alternatives.join(" / ")}?`;
    }

    return printImporters(baseMessage, ctx.importers);
  },
) {}

export class BlockNotFoundSurprise extends EvaluatorSurprise.extend<{
  block: number | t.Hash<t.linker.BlockSignature>;
}>(
  "block-not-found",
  (ctx) => printImporters(`block not found: ${ctx.block}`, ctx.importers),
) {}

/**
 * Thrown when a symbol is not exported from a module
 */
export class SymbolNotExportedSurprise extends EvaluatorSurprise.extend<{
  path: t.Path;
  name: string;
  alternatives?: string[];
}>(
  "symbol-not-exported",
  (ctx) =>
    printImporters(
      `symbol '${ctx.name}' is not exported from module ${ctx.path}${
        ctx.alternatives?.length
          ? `. did you mean ${ctx.alternatives.join(" / ")}?`
          : ""
      }`,
      ctx.importers,
    ),
) {}

/**
 * Runtime interface
 */

type RuntimeGraph = {
  version: number;
  blocks: Map<number, t.linker.Block>;

  modules: Map<
    t.SerializedSpecifier,
    {
      blocks: Map<number, number>;
      source: t.Hash<string>;
      exports: Map<string, Map<string, t.linker.Value>>;
      references: Map<string, t.linker.Value>;
    }
  >;

  order: Map<number, number>;
};

export interface Runtime {
  graph: RuntimeGraph;
  preload(
    hashes: t.Hash<string>[],
    libs: t.SerializedSpecifier[],
  ): Promise<void>;
  import<T>(target: string, specifier: t.Specifier, name: string): Promise<T>;
  $evaluate<T>(
    target: string,
    specifier: t.SerializedSpecifier,
    symbol: string,
  ): Promise<T>;
  evaluate<T>(
    target: string,
    block: t.Hash<t.linker.BlockSignature>,
    symbol: string,
  ): Promise<T>;
}

/**
 * Evaluator interface
 */
export interface Evaluator {
  runtime(
    graph: t.linker.Graph,
    libraries: Map<t.Path, Record<string, unknown>>,
  ): Runtime;
}
