/**
 * Linker interface
 */

import type * as t from "./t.ts";
import { printTree } from "@reframe/surprise/utils.ts";
import { Surprise } from "@reframe/surprise/index.ts";
import { SccNodeSignature } from "./scc-signature.ts";

/**
 * Base surprise class for linker-related errors
 */
export class LinkerSurprise extends Surprise.extend<{}>("linker") {}
export class NotFoundSurprise extends LinkerSurprise.extend<{
  specifier: t.SerializedSpecifier;
  importers: Importer[];
}>("not-found", (ctx) =>
  printTree([
    ctx.specifier,
    [...ctx.importers.reverse()]
      .map((importer) => [
        `${importer.kind}:${importer.name} (${importer.specifier})`,
        [],
      ]),
  ])) {}

export type Importer = {
  kind: "symbol" | "export" | "reference";
  specifier: t.SerializedSpecifier;
  name: string;
};

export class SymbolNotFoundSurprise extends LinkerSurprise.extend<{
  specifier: t.SerializedSpecifier;
  name: string;
  importers: Array<Importer>;
}>(
  "symbol-not-found",
  (ctx) =>
    printTree([
      `symbol '${ctx.name}' is not exported from module ${ctx.specifier}`,
      [...ctx.importers.reverse()]
        .map((
          importer,
        ) => [
          `${importer.kind} ${importer.name} (${importer.specifier})`,
          [],
        ]),
    ]),
) {}

export function flattenValue(value: Value): Array<
  | { kind: "symbol"; symbol: Symbol; path: string[] }
  | { kind: "reference"; reference: Reference; path: string[] }
> {
  const result: Array<
    | { kind: "symbol"; symbol: Symbol; path: string[] }
    | { kind: "reference"; reference: Reference; path: string[] }
  > = [];

  const walk = (val: Value, path: string[]) => {
    if (Array.isArray(val)) {
      for (const [key, sub] of val) {
        walk(sub, [...path, key]);
      }
    } else if ("block" in val) {
      result.push({ kind: "symbol", symbol: val, path: [...path, val.name] });
    } else {
      result.push({
        kind: "reference",
        reference: val,
        path: [...path, val.name],
      });
    }
  };

  walk(value, []);
  return result;
}

export type BlockSignature = SccNodeSignature<{
  path: t.SerializedSpecifier;
  index: number;
  source: t.Hash<string>;
  reframe: t.Hash<string>;
  references: Array<{
    specifier: t.SerializedSpecifier;
    path: string;
  }>;
}>;

export type EntrySymbol =
  | { kind: "local"; block: number }
  | { kind: "import"; name: string; from: t.SerializedSpecifier };

export type EntryExport =
  | { kind: "local"; symbol: string }
  | { kind: "import"; name: string; from: t.SerializedSpecifier };

export type DynamicImport = {
  specifier: t.SerializedSpecifier;
  symbols: Array<string> | "*";
  target: string | null;
};

export type Reference = {
  specifier: t.SerializedSpecifier;
  name: string;
};

export type Symbol = { block: number; name: string };

export type Many = Array<[string, Value]>;

export type Value = Symbol | Reference | Many;

export type Block = {
  signature: t.Hash<BlockSignature>;
  specifier: t.SerializedSpecifier;
  index: number;
  target: string;

  uses: Array<[string, Value]>;
  dynamic: Array<[string, Many]>;
};

export type Graph = {
  version: number;
  blocks: Array<[number, Block]>;

  modules: Array<[
    t.SerializedSpecifier,
    {
      blocks: Array<[number, number]>;
      source: t.Hash<string>;
      exports: Array<[string, Array<[string, Value]>]>;
      references: Array<[string, Value]>;
    },
  ]>;

  order: Array<[number, number]>;
};

export type EntrySource = {
  hash: t.Hash<string>;
  dynamicImports: Array<DynamicImport>;
  symbols: Map<string, EntrySymbol>;
  exports: Map<string, EntryExport>;
  blocks: Array<{
    target: string;
    uses: Array<string>;
    dynamic: Array<number>;
  }>;
  reexports: Array<t.SerializedSpecifier>;
};

export interface Linker {
  link(
    current: Graph | null,
    entry: {
      specifier: t.Specifier;
      export: string;
      targets: Array<string>;
    },
    read: (specifier: t.SerializedSpecifier) => Promise<EntrySource>,
  ): Promise<Graph>;
}
