import * as t from "./t.ts";
import { Compiler, ExportedSymbol, InnerSymbol, Source } from "./interface.ts";
import { analyze } from "./ts/analyze.ts";
import { measure } from "../00-base/measure.ts";

/**
 * Basic compiler implementation
 */
export const ts = t.factory(
  class implements Compiler {
    constructor() {
      // Empty constructor
    }

    async compile(
      path: t.Path,
      blob: t.Blob<unknown>,
      env: string,
    ): Promise<Source> {
      const sourceText = await blob.text();
      const { analysis, transpiled } = measure.work(
        "compiler.analyze",
        () =>
          analyze(
            path,
            sourceText,
            { env },
          ),
      );

      const source = {
        content: transpiled,
        dynamicImports: analysis.dynamicImports,
        symbols: new Map<string, InnerSymbol>(),
        exports: new Map<string, ExportedSymbol>(),
        reexports: [] as Array<{
          specifier: string;
          attributes: Record<string, string>;
        }>,
        blocks: [] as Array<{
          uses: Set<string>;
          dynamic: Set<number>;
          target: "server" | "client";
        }>,
      };

      for (const [symbol, def] of Object.entries(analysis.symbols)) {
        if (def[0] === "local") {
          source.symbols.set(symbol, {
            kind: "local",
            block: def[1],
          });
        } else if (def[0] === "import") {
          source.symbols.set(symbol, {
            kind: "import",
            name: def[1],
            specifier: def[2],
            attributes: def[3],
          });
        } else {
          throw t.Surprise.with`unknown symbol kind: ${def[0]}`;
        }
      }

      for (const [symbol, def] of Object.entries(analysis.exports)) {
        if (def[0] === "local") {
          source.exports.set(symbol, {
            kind: "local",
            symbol: def[1],
          });
        } else {
          source.exports.set(symbol, {
            kind: "import",
            name: def[1],
            specifier: def[2],
            attributes: def[3],
          });
        }
      }

      for (const [specifier, attributes] of analysis.reexports) {
        source.reexports.push({
          specifier,
          attributes,
        });
      }

      for (
        const { uses, dynamic, target } of analysis.blocks
      ) {
        source.blocks.push({
          uses: new Set(uses),
          dynamic: new Set(dynamic),
          target: target,
        });
      }

      return {
        content: source.content,
        dynamicImports: source.dynamicImports,
        symbols: Array.from(source.symbols.entries()),
        exports: Array.from(source.exports.entries()),
        reexports: source.reexports,
        blocks: source.blocks.map((
          { uses, dynamic, target },
        ) => ({
          uses: Array.from(uses),
          dynamic: Array.from(dynamic),
          target,
        })),
      };
    }
  },
);
