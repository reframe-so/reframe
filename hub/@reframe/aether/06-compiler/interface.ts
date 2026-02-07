import * as t from "./t.ts";

/**
 * Base surprise class for compiler-related errors
 */
export class CompilerSurprise extends t.Surprise.extend<{}>("compiler") {}

/**
 * Compiler interface
 *
 * takes a path and a blob and returns analysis
 */

export type InnerSymbol =
  | { kind: "local"; block: number }
  | {
    kind: "import";
    name: string;
    specifier: string;
    attributes: Record<string, string>;
  };

export type ExportedSymbol =
  | { kind: "local"; symbol: string }
  | {
    kind: "import";
    name: string;
    specifier: string;
    attributes: Record<string, string>;
  };

export interface Source {
  content: string;

  dynamicImports: Array<{
    specifier: string;
    attributes: Record<string, string>;
    symbols: Array<string> | "*";
    target: string | null;
  }>;

  symbols: Array<[string, InnerSymbol]>;
  exports: Array<[string, ExportedSymbol]>;

  reexports: Array<{
    specifier: string;
    attributes: Record<string, string>;
  }>;

  blocks: Array<{
    uses: Array<string>;
    dynamic: Array<number>;
    target: "client" | "server" | "worker";
  }>;
}

export interface Compiler {
  compile(
    path: t.Path,
    blob: t.Blob<unknown>,
    target: string,
  ): Promise<Source>;
}
