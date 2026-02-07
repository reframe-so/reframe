/**
 * Type declarations for undocumented TypeScript internal APIs.
 * These APIs are used by the transpiler but aren't part of the public API.
 */

import type { default as TypeScript } from "npm:typescript";

declare module "npm:typescript" {
  /**
   * Normalizes and validates compiler options, emitting diagnostics for invalid configurations.
   */
  export function fixupCompilerOptions(
    options: TypeScript.CompilerOptions,
    diagnostics: TypeScript.Diagnostic[],
  ): TypeScript.CompilerOptions;

  /**
   * Returns the newline character(s) based on compiler options.
   */
  export function getNewLineCharacter(
    options: TypeScript.CompilerOptions,
  ): string;

  /**
   * Normalizes a file path to use forward slashes.
   */
  export function normalizePath(path: string): string;

  /**
   * Checks if a file name has a specific extension.
   */
  export function fileExtensionIs(fileName: string, extension: string): boolean;

  /**
   * Gets the ECMAScript target version from compiler options.
   */
  export function getEmitScriptTarget(
    options: TypeScript.CompilerOptions,
  ): TypeScript.ScriptTarget;

  /**
   * Converts a file name to a canonical path.
   */
  export function toPath(
    fileName: string,
    basePath: string,
    getCanonicalFileName: (path: string) => string,
  ): TypeScript.Path;

  /**
   * Returns a function that sets the external module indicator on source files.
   */
  export function getSetExternalModuleIndicator(
    options: TypeScript.CompilerOptions,
  ): (file: TypeScript.SourceFile) => void;

  /**
   * Adds elements from one array to another.
   */
  export function addRange<T>(to: T[], from: readonly T[] | undefined): T[];
}
