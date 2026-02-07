import * as t from "./t.ts";
import {
  block,
  EntryExport,
  EntrySource,
  EntrySymbol,
} from "./index.ts";
import { compiler } from "../06-compiler/ts.mock.ts";

export function link(options: {
  entry: {
    specifier: t.Specifier;
    export: string;
    targets: Array<string>;
  };
  source: Record<t.SerializedSpecifier, string>;
}) {
  const read = async (path: t.SerializedSpecifier) => {
    const specifier = t.Specifier.deserialize(path);

    const target = specifier.attributes.env ?? "server";
    if (specifier.attributes.env) {
      delete specifier.attributes.env;
    }
    const readerPath = specifier.serialize();
    specifier.attributes = {
      ...specifier.attributes,
      env: target,
    };

    if (!options.source[readerPath]) {
      throw t.Surprise.with`source not found: ${readerPath}`;
    }

    const source = await compiler.compile(
      path,
      new t.Blob(options.source[readerPath]),
      target as "server" | "client",
    );

    const hash = await t.hash<string>(
      new TextEncoder().encode(JSON.stringify(source.content)),
    );

    return {
      hash,
      symbols: new Map(
        await Promise.all(
          source.symbols.map(
            async ([name, def]): Promise<[
              string,
              EntrySymbol,
            ]> => {
              if (def.kind === "local") {
                return [name, { kind: "local", block: def.block }];
              }

              const next = new t.Specifier(
                "yan",
                t.cleanPath(def.specifier),
                { ...specifier.attributes, ...def.attributes },
              );

              return [name, {
                kind: "import",
                name: def.name,
                from: next.serialize(),
              }];
            },
          ),
        ),
      ),
      exports: new Map(
        await Promise.all(
          source.exports.map(
            async ([name, def]): Promise<[string, EntryExport]> => {
              if (def.kind === "local") {
                return [name, { kind: "local", symbol: def.symbol }];
              }
              const next = new t.Specifier(
                "yan",
                t.cleanPath(def.specifier),
                { ...specifier.attributes, ...def.attributes },
              );
              return [name, {
                kind: "import",
                name: def.name,
                from: next.serialize(),
              }];
            },
          ),
        ),
      ),
      blocks: source.blocks,

      reexports: await Promise.all(
        source.reexports.map(
          (def) =>
            new t.Specifier(
              "yan",
              t.cleanPath(def.specifier),
              def.attributes,
            ).serialize(),
        ),
      ),

      dynamicImports: [],
    } satisfies EntrySource;
  };

  const linker = block()();
  return linker.link(null, options.entry, read);
}
