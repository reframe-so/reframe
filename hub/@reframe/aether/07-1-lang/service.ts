import ts from "npm:typescript";
import * as t from "./t.ts";
import { mapImports } from "../06-1-npm/map-imports.ts";
import { compilerOptions as defaultOptions } from "../06-compiler/ts/system.ts";

const PACKAGES_WITHOUT_TYPES = new Set(["stream"]);

const compilerOptions: ts.CompilerOptions = {
  ...defaultOptions,
  composite: false,
  noEmit: true,
  incremental: true,
  allowImportingTsExtensions: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  skipLibCheck: true,
  allowArbitraryExtensions: true,
  tsBuildInfoFile: "/.tsbuildinfo",
};

const knownLibFilesForCompilerOptions = (
  compilerOptions: ts.CompilerOptions,
): string[] => {
  const target = compilerOptions.target ?? ts.ScriptTarget.ES5;
  const lib = compilerOptions.lib ?? [];

  const files = [
    "lib.d.ts",
    "lib.decorators.d.ts",
    "lib.decorators.legacy.d.ts",
    "lib.dom.asynciterable.d.ts",
    "lib.dom.d.ts",
    "lib.dom.iterable.d.ts",
    "lib.webworker.asynciterable.d.ts",
    "lib.webworker.d.ts",
    "lib.webworker.importscripts.d.ts",
    "lib.webworker.iterable.d.ts",
    "lib.scripthost.d.ts",
    "lib.es5.d.ts",
    "lib.es6.d.ts",
    "lib.es2015.collection.d.ts",
    "lib.es2015.core.d.ts",
    "lib.es2015.d.ts",
    "lib.es2015.generator.d.ts",
    "lib.es2015.iterable.d.ts",
    "lib.es2015.promise.d.ts",
    "lib.es2015.proxy.d.ts",
    "lib.es2015.reflect.d.ts",
    "lib.es2015.symbol.d.ts",
    "lib.es2015.symbol.wellknown.d.ts",
    "lib.es2016.array.include.d.ts",
    "lib.es2016.d.ts",
    "lib.es2016.full.d.ts",
    "lib.es2016.intl.d.ts",
    "lib.es2017.arraybuffer.d.ts",
    "lib.es2017.d.ts",
    "lib.es2017.date.d.ts",
    "lib.es2017.full.d.ts",
    "lib.es2017.intl.d.ts",
    "lib.es2017.object.d.ts",
    "lib.es2017.sharedmemory.d.ts",
    "lib.es2017.string.d.ts",
    "lib.es2017.typedarrays.d.ts",
    "lib.es2018.asyncgenerator.d.ts",
    "lib.es2018.asynciterable.d.ts",
    "lib.es2018.d.ts",
    "lib.es2018.full.d.ts",
    "lib.es2018.intl.d.ts",
    "lib.es2018.promise.d.ts",
    "lib.es2018.regexp.d.ts",
    "lib.es2019.array.d.ts",
    "lib.es2019.d.ts",
    "lib.es2019.full.d.ts",
    "lib.es2019.intl.d.ts",
    "lib.es2019.object.d.ts",
    "lib.es2019.string.d.ts",
    "lib.es2019.symbol.d.ts",
    "lib.es2020.bigint.d.ts",
    "lib.es2020.d.ts",
    "lib.es2020.date.d.ts",
    "lib.es2020.full.d.ts",
    "lib.es2020.intl.d.ts",
    "lib.es2020.number.d.ts",
    "lib.es2020.promise.d.ts",
    "lib.es2020.sharedmemory.d.ts",
    "lib.es2020.string.d.ts",
    "lib.es2020.symbol.wellknown.d.ts",
    "lib.es2021.d.ts",
    "lib.es2021.full.d.ts",
    "lib.es2021.intl.d.ts",
    "lib.es2021.promise.d.ts",
    "lib.es2021.string.d.ts",
    "lib.es2021.weakref.d.ts",
    "lib.es2022.array.d.ts",
    "lib.es2022.d.ts",
    "lib.es2022.error.d.ts",
    "lib.es2022.full.d.ts",
    "lib.es2022.intl.d.ts",
    "lib.es2022.object.d.ts",
    "lib.es2022.regexp.d.ts",
    "lib.es2022.string.d.ts",
    "lib.es2023.array.d.ts",
    "lib.es2023.collection.d.ts",
    "lib.es2023.d.ts",
    "lib.es2023.full.d.ts",
    "lib.es2023.intl.d.ts",
    "lib.es2024.arraybuffer.d.ts",
    "lib.es2024.collection.d.ts",
    "lib.es2024.d.ts",
    "lib.es2024.full.d.ts",
    "lib.es2024.object.d.ts",
    "lib.es2024.promise.d.ts",
    "lib.es2024.regexp.d.ts",
    "lib.es2024.sharedmemory.d.ts",
    "lib.es2024.string.d.ts",
    "lib.esnext.array.d.ts",
    "lib.esnext.collection.d.ts",
    "lib.esnext.d.ts",
    "lib.esnext.decorators.d.ts",
    "lib.esnext.disposable.d.ts",
    "lib.esnext.float16.d.ts",
    "lib.esnext.full.d.ts",
    "lib.esnext.intl.d.ts",
    "lib.esnext.iterator.d.ts",
    "lib.esnext.promise.d.ts",
  ];

  const _targetToCut = ts.ScriptTarget[target].toLowerCase();
  const targetToCut = _targetToCut === "latest" ? "esnext" : _targetToCut;
  const matches = files.filter((f) => f.startsWith(`lib.${targetToCut}`));
  const targetCutIndex = files.indexOf(matches.pop()!);

  const getMax = (array: number[]) =>
    array && array.length
      ? array.reduce((max, current) => (current > max ? current : max))
      : undefined;

  const indexesForCutting = lib.map((lib) => {
    const matches = files.filter((f) =>
      f.startsWith(`lib.${lib.toLowerCase()}`)
    );
    if (matches.length === 0) return 0;

    const cutIndex = files.indexOf(matches.pop()!);
    return cutIndex;
  });

  const libCutIndex = getMax(indexesForCutting) || 0;
  const finalCutIndex = Math.max(targetCutIndex, libCutIndex);
  return files.slice(0, finalCutIndex + 1);
};

interface FileEntry {
  source: string;
  version: string; // Content hash for incremental compilation
  importMap: Record<string, string>;
}

export const typescript = t.factory(
  class TypeScriptProject {
    #fsMap: Map<string, FileEntry>;
    #program: ts.BuilderProgram | null = null;

    #reader: t.reader.Reader;
    #entryPoint: string;

    constructor(
      reader: t.Factory<t.reader.Reader>,
      entryPoint: string,
    ) {
      this.#reader = reader();
      this.#fsMap = new Map();
      this.#entryPoint = entryPoint;
    }

    async #loadLibs(): Promise<void> {
      const libFiles = knownLibFilesForCompilerOptions(compilerOptions);
      const entry = t.specifier("/~yan/(env=type)/@/app.tsx");

      await Promise.all(
        libFiles.map(async (lib) => {
          const specifier = await this.#reader.resolve(
            `npm:typescript/lib/${lib}`,
            { env: "type" },
            entry,
          );

          const blob = await this.#reader.read(specifier);
          const hash = await blob.hash();
          const text = await blob.text();

          this.#fsMap.set("/" + lib, {
            source: text,
            version: hash,
            importMap: {},
          });
        }),
      );
    }

    async #createEntry(source: string, importMap: Record<string, string> = {}) {
      const blob = new t.Blob(source);

      return {
        version: await blob.hash(),
        source: await blob.text(),
        importMap: importMap,
      } satisfies FileEntry;
    }

    async #traverse(
      path: t.SerializedSpecifier,
      visited: Set<t.SerializedSpecifier> = new Set(),
    ): Promise<void> {
      if (visited.has(path)) {
        return;
      }
      visited.add(path);

      const specifier = t.specifier(path);

      // Handle lib: scheme with empty export
      if (specifier.scheme === "lib") {
        this.#fsMap.set(
          path,
          await this.#createEntry(`
          export const env: Record<string, string> = {};
          export const runtimeServer: string = "";
        `),
        );
        return;
      }

      // Handle node: scheme - redirect to @types/node
      if (specifier.scheme === "node") {
        const moduleName = specifier.path.slice(1);

        if (PACKAGES_WITHOUT_TYPES.has(moduleName)) {
          this.#fsMap.set(
            path,
            await this.#createEntry(`export {}`),
          );
          return;
        }

        const typesSpecifier = t.specifier({
          scheme: "npm",
          path: `/@types/node/${moduleName}~`,
          attributes: specifier.attributes,
        });
        const typesPath = typesSpecifier.serialize();

        // Store a re-export to the types path

        this.#fsMap.set(
          path,
          await this.#createEntry(
            `export * from "${typesPath}";`,
            { [typesPath]: typesPath },
          ),
        );

        await this.#traverse(typesPath, visited);
        return;
      }

      try {
        const blob = await this.#reader.read(specifier);
        const content = await blob.clone().text();

        // Extract imports using mapImports
        const imports: Array<
          { specifier: string; attributes: Record<string, string> }
        > = [];

        mapImports(content, (spec, attrs) => {
          imports.push({ specifier: spec, attributes: attrs });
          return spec;
        });

        // Resolve all imports and build the import map
        const importMap: Record<t.SerializedSpecifier, t.SerializedSpecifier> =
          {};

        await Promise.all(
          imports.map(async ({ specifier: spec, attributes }) => {
            try {
              const resolved = await this.#reader.resolve(
                spec,
                attributes,
                specifier,
              );

              importMap[
                new t.Specifier("i", `/${spec}`, attributes).serialize()
              ] = resolved.serialize();
            } catch (_error) {
              // Skip unresolvable imports - they'll show as TS errors
            }
          }),
        );

        this.#fsMap.set(path, await this.#createEntry(content, importMap));

        // Traverse children (errors handled individually, don't fail parent)
        await Promise.all(
          Object.values(importMap).map((imp) =>
            this.#traverse(imp, visited).catch(() => {})
          ),
        );
      } catch (error) {
        // Handle packages without types
        // console.log(`[traverse-error] ${path}:`, error);
        this.#fsMap.set(path, await this.#createEntry("export {}"));
      }
    }

    async initialize(): Promise<void> {
      // Load TypeScript lib files
      await this.#loadLibs();

      // Pre-load JSX runtime (implicitly imported by TypeScript for JSX transformation)
      const jsxRuntimeSpecifier = await this.#reader.resolve(
        "npm:react/jsx-runtime",
        { env: "type" },
        t.specifier("/~yan/(env=type)/@/app.tsx"), // dummy importer
      );

      const jsxRuntimePath = jsxRuntimeSpecifier.serialize();
      await this.#traverse(jsxRuntimePath);

      // Traverse from entry point
      const startPath = t.specifier(`/~yan/(env=type)/${this.#entryPoint}`)
        .serialize();

      await this.#traverse(startPath);

      // Load existing tsbuildinfo if available
      // try {
      //   const buildInfo = await Deno.readTextFile(this.#buildInfoPath);
      //   this.#fsMap.set("/.tsbuildinfo", {
      //     source: buildInfo,
      //     version: await hashContent(buildInfo),
      //     importMap: {},
      //   });
      //   console.log(`[tsbuildinfo] Loaded from ${this.#buildInfoPath}`);
      // } catch {
      //   console.log(`[tsbuildinfo] No existing buildinfo found`);
      // }

      // Create incremental compiler host
      const baseHost = ts.createIncrementalCompilerHost(compilerOptions);
      const host: ts.CompilerHost = {
        ...baseHost,
        getSourceFile: (fileName, languageVersion) => {
          const file = this.#fsMap.get(fileName);
          if (file) {
            // Use createLanguageServiceSourceFile to get proper version support
            return ts.createLanguageServiceSourceFile(
              fileName,
              ts.ScriptSnapshot.fromString(file.source),
              languageVersion,
              file.version,
              true,
            );
          }
          // Fall back to base host for system lib files
          return baseHost.getSourceFile(fileName, languageVersion);
        },
        writeFile: (fileName, content) => {
          this.#fsMap.set(fileName, {
            source: content,
            version: "pending", // Will be updated on next read
            importMap: {},
          });
          // Persist tsbuildinfo to disk
          // if (fileName === "/.tsbuildinfo") {
          //   Deno.writeTextFile(this.#buildInfoPath, content).then(() => {
          //     console.log(`[tsbuildinfo] Saved to ${this.#buildInfoPath}`);
          //   });
          // }
        },
        fileExists: (fileName) => {
          if (this.#fsMap.has(fileName)) return true;
          return baseHost.fileExists(fileName);
        },
        readFile: (fileName) => {
          const file = this.#fsMap.get(fileName);
          if (file !== undefined) {
            return file.source;
          }
          return baseHost.readFile(fileName);
        },
        resolveModuleNameLiterals: (
          moduleLiterals,
          containingFile,
          _redirectedReference,
          _options,
          _containingSourceFile,
          _reusedNames,
        ) => {
          return moduleLiterals.map((moduleLiteral) => {
            const specifier = moduleLiteral.text;
            const attributes: Record<string, string> = {};
            const importDecl = moduleLiteral.parent as ts.ImportDeclaration;
            for (
              const element of importDecl.attributes?.elements ?? []
            ) {
              attributes[element.name.text] =
                (element.value as ts.StringLiteral).text;
            }

            // Handle implicit JSX runtime import
            if (specifier === "npm:react/jsx-runtime") {
              return {
                resolvedModule: {
                  resolvedFileName: jsxRuntimePath,
                  extension: ts.Extension.Dts,
                  isExternalLibraryImport: false,
                },
              };
            }

            const key = new t.Specifier("i", `/${specifier}`, attributes)
              .serialize();
            const resolvedFileName = this.#fsMap.get(containingFile)
              ?.importMap[key];

            if (!resolvedFileName) {
              return { resolvedModule: undefined };
            }
            return {
              resolvedModule: {
                resolvedFileName,
                extension: ts.Extension.Tsx,
                isExternalLibraryImport: false,
              },
            };
          });
        },
      };

      // Get entry point for root files
      const entryPath = t.specifier(
        `/~yan/(env=type)/${this.#entryPoint}`,
      ).serialize();

      // Create incremental program
      this.#program = ts.createIncrementalProgram({
        rootNames: [entryPath],
        options: compilerOptions,
        host,
      });
    }

    #flattenDiagnosticMessageChain(
      chain: ts.DiagnosticMessageChain,
      indent = 0,
    ): string {
      const prefix = "  ".repeat(indent);
      let result = prefix + chain.messageText;

      if (chain.next) {
        for (const next of chain.next) {
          result += "\n" +
            this.#flattenDiagnosticMessageChain(next, indent + 1);
        }
      }

      return result;
    }

    getDiagnostics(path: string): Array<{
      start: { line: number; character: number };
      end: { line: number; character: number };
      messageText: string;
      category: ts.DiagnosticCategory;
      code: number;
      diagType: string;
    }> {
      const program = this.#program!.getProgram();
      const sourceFile = program.getSourceFile(path);

      if (!sourceFile) {
        return [];
      }

      const syntacticDiagnostics = program.getSyntacticDiagnostics(sourceFile);
      const semanticDiagnostics = program.getSemanticDiagnostics(sourceFile);

      const diagnostics = [
        ...syntacticDiagnostics.map((diag) => ({
          ...diag,
          diagType: "syntactic" as const,
        })),
        ...semanticDiagnostics.map((diag) => ({
          ...diag,
          diagType: "semantic" as const,
        })),
      ];

      return diagnostics.map((diag) => {
        let start = { line: 1, character: 1 };
        let end = { line: 1, character: 1 };

        if (diag.start !== undefined) {
          const startPos = sourceFile.getLineAndCharacterOfPosition(diag.start);
          start = {
            line: startPos.line + 1,
            character: startPos.character + 1,
          };

          if (diag.length !== undefined) {
            const endPos = sourceFile.getLineAndCharacterOfPosition(
              diag.start + diag.length,
            );
            end = {
              line: endPos.line + 1,
              character: endPos.character + 1,
            };
          } else {
            end = start;
          }
        }

        // Flatten diagnostic message chain to show full type mismatch details
        const messageText = typeof diag.messageText === "string"
          ? diag.messageText
          : this.#flattenDiagnosticMessageChain(diag.messageText);

        return {
          start,
          end,
          messageText,
          category: diag.category,
          code: diag.code,
          diagType: diag.diagType,
        };
      });
    }

    getAllDiagnostics(): Array<{
      fileName: string;
      start: { line: number; character: number };
      end: { line: number; character: number };
      messageText: string;
      category: ts.DiagnosticCategory;
      code: number;
      diagType: string;
    }> {
      const allDiagnostics: Array<{
        fileName: string;
        start: { line: number; character: number };
        end: { line: number; character: number };
        messageText: string;
        category: ts.DiagnosticCategory;
        code: number;
        diagType: string;
      }> = [];

      // Get diagnostics for all non-lib files that have source files in the program
      const program = this.#program!.getProgram();
      for (const path of this.#fsMap.keys()) {
        if (path.startsWith("/lib.")) continue;
        if (path.startsWith("/~npm")) continue;

        // Only process files that are actually in the program
        const sourceFile = program.getSourceFile(path);
        if (!sourceFile) continue;

        const fileDiagnostics = this.getDiagnostics(path);
        for (const diag of fileDiagnostics) {
          allDiagnostics.push({
            fileName: path,
            ...diag,
          });
        }
      }

      // Emit to write tsbuildinfo after collecting all diagnostics
      this.#program!.emit();

      return allDiagnostics;
    }

    getSourceFile(path: string): ts.SourceFile | undefined {
      return this.#program!.getProgram().getSourceFile(path);
    }

    getFiles(): string[] {
      return Array.from(this.#fsMap.keys());
    }
  },
);

export type TypeScriptProject = ReturnType<ReturnType<typeof typescript>>;
