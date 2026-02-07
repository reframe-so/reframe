import { createProjectSync, ts } from "npm:@ts-morph/bootstrap";
import * as tsInternal from "./ts-internals.ts";
import { measure } from "@reframe/aether/00-base/measure.ts";

type X = ts.LanguageServiceHost;
export type TransformerFactory<Ctx> = (
  ctx: Ctx,
) => <T extends ts.Node>(
  node: T,
  context: ts.TransformationContext,
) => null | T | T[];

export const createVisitorTransformer =
  <Ctx>(factory: TransformerFactory<Ctx>) =>
  (
    initialize: (sourceFile: ts.SourceFile) => Ctx,
  ): ts.TransformerFactory<ts.SourceFile> =>
  (context) =>
  (sourceFile) =>
    visitSourceFile(sourceFile, context, factory(initialize(sourceFile)));

export function visitSourceFile(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  visitor: <T extends ts.Node>(
    node: T,
    context: ts.TransformationContext,
  ) => T | T[] | null,
) {
  const result = visitNode(sourceFile, context, visitor);

  if (Array.isArray(result)) {
    if (result.length !== 1) {
      throw new Error("must return a single node");
    }

    const node = result[0];

    if (!node || !ts.isSourceFile(node)) {
      throw new Error("must return a SourceFile node");
    }

    return node;
  }

  return result;
}

export function visitNode<T extends ts.Node>(
  node: T,
  context: ts.TransformationContext,
  visitor: <T extends ts.Node>(
    node: T,
    context: ts.TransformationContext,
  ) => T | T[] | null,
) {
  return visitNodeAndChildren(node);

  function visitNodeAndChildren<T extends ts.Node>(node: T): T | T[] {
    const result = visitor(node, context);

    if (result === null) {
      return node;
    }

    if (!Array.isArray(result)) {
      return ts.visitEachChild(result, visitNodeAndChildren, context);
    }

    return result.map((newNode) =>
      ts.visitEachChild(newNode, visitNodeAndChildren, context)
    );
  }
}

// function transpileWorker(input: string, transpileOptions: TranspileOptions, declaration?: boolean): TranspileOutput {

const barebonesLibName = "lib.d.ts";
let barebonesLibSourceFile: ts.SourceFile | undefined;
const barebonesLibContent = `/// <reference no-default-lib="true"/>
interface Boolean {}
interface Function {}
interface CallableFunction {}
interface NewableFunction {}
interface IArguments {}
interface Number {}
interface Object {}
interface RegExp {}
interface String {}
interface Array<T> { length: number; [n: number]: T; }
interface SymbolConstructor {
    (desc?: string | number): symbol;
    for(name: string): symbol;
    readonly toStringTag: symbol;
}
declare var Symbol: SymbolConstructor;
interface Symbol {
    readonly [Symbol.toStringTag]: string;
}`;

export const compilerOptions = {
  ...ts.getDefaultCompilerOptions(),
  strict: true,
  composite: false,
  noEmit: false,
  incremental: false,
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  jsxImportSource: "npm:react",
  jsxFactory: "React.createElement",
  jsxFragmentFactory: "React.Fragment",
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  removeComments: true,
} as ts.CompilerOptions;

export const transpile = (
  path: string,
  content: string,
  transpileOptions: Omit<ts.TranspileOptions, "transformers"> & {
    transformers?: {
      after?: ((
        program: ts.Program,
        context: ts.TransformationContext,
      ) => ts.Transformer<ts.SourceFile>)[];
      before?: ((
        program: ts.Program,
        context: ts.TransformationContext,
      ) => ts.Transformer<ts.SourceFile>)[];
    };
  },
) => {
  barebonesLibSourceFile ??= ts.createSourceFile(
    barebonesLibName,
    barebonesLibContent,
    { languageVersion: ts.ScriptTarget.Latest },
  );

  transpileOptions.fileName = path;

  const diagnostics: ts.Diagnostic[] = [];
  const options: ts.CompilerOptions = {
    ...compilerOptions,
    ...(transpileOptions.compilerOptions
      ? tsInternal.fixupCompilerOptions(
        transpileOptions.compilerOptions,
        diagnostics,
      )
      : {}),

    isolatedModules: true,
    incremental: undefined,
    noCheck: true,
    noEmit: undefined,
    composite: undefined,
    noLib: true,
    noResolve: true,

    // transpileModule does not write anything to disk so there is no need to verify that there are no conflicts between input and output paths.
    suppressOutputPathCheck: true,

    // Filename can be non-ts file.
    allowNonTsExtensions: true,

    declaration: false,
    declarationMap: false,
    sourceMap: true,
    // inlineSourceMap: true,
    // inlineSources: true,
  };

  const newLine = tsInternal.getNewLineCharacter(options);

  const inputFileName = transpileOptions.fileName ||
    (transpileOptions.compilerOptions && transpileOptions.compilerOptions.jsx
      ? "module.tsx"
      : "module.ts");

  const compilerHost: ts.CompilerHost = {
    getSourceFile: (fileName) =>
      fileName === tsInternal.normalizePath(inputFileName)
        ? sourceFile
        : fileName === tsInternal.normalizePath(barebonesLibName)
        ? barebonesLibSourceFile
        : undefined,
    writeFile: (name, text) => {
      if (tsInternal.fileExtensionIs(name, ".map")) {
        sourceMapText = text;
      } else {
        outputText = text;
      }
    },
    getDefaultLibFileName: () => barebonesLibName,
    useCaseSensitiveFileNames: () => false,
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => "",
    getNewLine: () => newLine,
    fileExists: (fileName): boolean => fileName === inputFileName,
    readFile: () => "",
    directoryExists: () => true,
    getDirectories: () => [],
  };

  const sourceFile = ts.createSourceFile(inputFileName, content, {
    languageVersion: tsInternal.getEmitScriptTarget(options),
    impliedNodeFormat: ts.getImpliedNodeFormatForFile(
      tsInternal.toPath(inputFileName, "", compilerHost.getCanonicalFileName),
      /*packageJsonInfoCache*/ undefined,
      compilerHost,
      options,
    ),
    setExternalModuleIndicator: tsInternal.getSetExternalModuleIndicator(
      options,
    ),
    jsDocParsingMode: transpileOptions.jsDocParsingMode ??
      ts.JSDocParsingMode.ParseAll,
  });

  if (transpileOptions.moduleName) {
    sourceFile.moduleName = transpileOptions.moduleName;
  }

  let outputText: string | undefined;
  let sourceMapText: string | undefined;

  const inputs = [inputFileName];
  const program = measure.work(
    "compiler.transpile.createProgram",
    () => ts.createProgram(inputs, options, compilerHost),
  );

  const addRange = (
    to: ts.Diagnostic[],
    from: readonly ts.Diagnostic[] | undefined,
  ) => {
    tsInternal.addRange(to, from);
  };

  addRange(
    /*to*/ diagnostics,
    /*from*/ program.getSyntacticDiagnostics(sourceFile),
  );
  addRange(/*to*/ diagnostics, /*from*/ program.getOptionsDiagnostics());

  const result = measure.work(
    "compiler.transpile.emit",
    () =>
      program.emit(
        /*targetSourceFile*/ undefined,
        /*writeFile*/ undefined,
        /*cancellationToken*/ undefined,
        /*emitOnlyDtsFiles*/ false,
        {
          after: transpileOptions.transformers?.after?.map(
            (transformer) => (context) => transformer(program, context),
          ),
          before: transpileOptions.transformers?.before?.map(
            (transformer) => (context) => transformer(program, context),
          ),
        },
        // /*forceDtsEmit*/ false,
      ),
  );

  addRange(/*to*/ diagnostics, /*from*/ result.diagnostics);

  if (outputText === undefined) {
    throw new Error("Output generation failed");
  }

  // return { outputText, diagnostics, sourceMapText };

  return {
    program,
    content: outputText,
    sourceMap: sourceMapText,
    diagnostics,
  };
};

export const createTsSystem = () => {
  const project = measure.work(
    "compiler.tsSystem.createProject",
    () => createProjectSync({ useInMemoryFileSystem: true }),
  );

  const program = {
    current: project.createProgram({
      options: compilerOptions,
      rootNames: [],
    }),
  };

  return {
    get: (path: string) => {
      const sourceFile = program.current.getSourceFile(path);

      return sourceFile;
    },
    set: (path: string, content: string) => {
      project.createSourceFile(path, content);

      program.current = measure.work(
        "compiler.tsSystem.updateProgram",
        () =>
          project.createProgram({
            options: compilerOptions,
            oldProgram: program.current,
            rootNames: [...program.current.getRootFileNames(), path],
          }),
      );
    },
    getTypeChecker: () => program.current.getTypeChecker(),
    getSourceFile: (path: string, content: string) => {
      return project.createSourceFile(path, content);
    },
    transpile: (
      path: string,
      content: string,
      config: {
        transformers?: ts.CustomTransformers;
        compilerOptions?: ts.CompilerOptions;
      },
    ) => {
      const result = ts.transpileModule(content, {
        compilerOptions: {
          ...compilerOptions,
          ...config.compilerOptions,
        },
        fileName: path,
        reportDiagnostics: true,
        transformers: config.transformers,
      });

      return result;
    },
  };
};

export { ts };
