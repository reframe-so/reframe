/**
 * Type-safe wrappers for undocumented TypeScript internal APIs.
 * These APIs are used by the transpiler but aren't part of the public API.
 */

import { ts } from "npm:@ts-morph/bootstrap";

// Define the internal API interface
interface TsInternals {
  fixupCompilerOptions(
    options: ts.CompilerOptions,
    diagnostics: ts.Diagnostic[],
  ): ts.CompilerOptions;

  getNewLineCharacter(options: ts.CompilerOptions): string;

  normalizePath(path: string): string;

  fileExtensionIs(fileName: string, extension: string): boolean;

  getEmitScriptTarget(options: ts.CompilerOptions): ts.ScriptTarget;

  toPath(
    fileName: string,
    basePath: string,
    getCanonicalFileName: (path: string) => string,
  ): ts.Path;

  getSetExternalModuleIndicator(
    options: ts.CompilerOptions,
  ): (file: ts.SourceFile) => void;

  addRange<T>(to: T[], from: readonly T[] | undefined): T[];
}

// Cast ts to include the internal APIs
// These are stable internal APIs that TypeScript doesn't expose in its public type definitions
const tsInternal = ts as typeof ts & TsInternals;

export const fixupCompilerOptions = tsInternal.fixupCompilerOptions;
export const getNewLineCharacter = tsInternal.getNewLineCharacter;
export const normalizePath = tsInternal.normalizePath;
export const fileExtensionIs = tsInternal.fileExtensionIs;
export const getEmitScriptTarget = tsInternal.getEmitScriptTarget;
export const toPath = tsInternal.toPath;
export const getSetExternalModuleIndicator = tsInternal.getSetExternalModuleIndicator;
export const addRange = tsInternal.addRange;
