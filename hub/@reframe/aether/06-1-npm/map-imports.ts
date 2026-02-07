import { ts } from "../06-compiler/ts/system.ts";

/**
 * Extracts import attributes from an ImportAttributes node.
 * Returns a record of attribute name -> value, sorted by key.
 */
const extractImportAttributes = (
  node?: ts.ImportAttributes,
): Record<string, string> => {
  const attributes: Record<string, string> = {};

  if (node) {
    for (const attribute of node.elements) {
      if (!ts.isStringLiteral(attribute.value)) {
        // skip non-string attributes
        continue;
      }

      const key = ts.isIdentifier(attribute.name)
        ? attribute.name.text
        : attribute.name.text;
      attributes[key] = attribute.value.text;
    }
  }

  // Sort by key for consistent ordering
  return Object.fromEntries(
    Object.entries(attributes).sort((a, b) => a[0].localeCompare(b[0])),
  );
};

/**
 * Extracts attributes from dynamic import's second argument.
 * e.g., import("foo", { with: { env: "server" } })
 */
const extractDynamicImportAttributes = (
  node: ts.CallExpression,
): Record<string, string> => {
  if (node.arguments.length < 2) {
    return {};
  }

  const optionsArg = node.arguments[1];
  if (!ts.isObjectLiteralExpression(optionsArg)) {
    return {};
  }

  const withProperty = optionsArg.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "with",
  );

  if (
    !withProperty ||
    !ts.isPropertyAssignment(withProperty) ||
    !ts.isObjectLiteralExpression(withProperty.initializer)
  ) {
    return {};
  }

  const attributes: Record<string, string> = {};

  for (const property of withProperty.initializer.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    if (!ts.isStringLiteral(property.initializer)) {
      continue;
    }
    if (!ts.isIdentifier(property.name)) {
      continue;
    }

    attributes[property.name.text] = property.initializer.text;
  }

  // Sort by key for consistent ordering
  return Object.fromEntries(
    Object.entries(attributes).sort((a, b) => a[0].localeCompare(b[0])),
  );
};

/**
 * Maps import/export specifiers in TypeScript/JavaScript source code.
 *
 * Finds all module specifiers in:
 * - Import declarations: `import { x } from "./foo"`
 * - Type imports: `import type { X } from "./foo"`
 * - Export declarations: `export { x } from "./foo"`
 * - Re-exports: `export * from "./foo"`
 * - Dynamic imports: `import("./foo")`
 *
 * @param source - The source code to transform
 * @param mapper - Function to transform each specifier string, receives attributes as second arg
 * @returns The transformed source code
 */
export const mapImports = (
  source: string,
  mapper: (specifier: string, attributes: Record<string, string>) => string,
): string => {
  const sourceFile = ts.createSourceFile(
    "input.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX, // Use TSX to handle both TS and JSX content
  );

  const replacements: Array<{ start: number; end: number; text: string }> = [];

  const visitNode = (node: ts.Node): void => {
    // Import declaration: import { x } from "specifier"
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const original = node.moduleSpecifier.text;
        const attributes = extractImportAttributes(node.attributes);
        const mapped = mapper(original, attributes);
        if (mapped !== original) {
          replacements.push({
            start: node.moduleSpecifier.getStart(sourceFile) + 1, // skip opening quote
            end: node.moduleSpecifier.getEnd() - 1, // skip closing quote
            text: mapped,
          });
        }
      }
    }

    // Export declaration: export { x } from "specifier" or export * from "specifier"
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const original = node.moduleSpecifier.text;
        const attributes = extractImportAttributes(node.attributes);
        const mapped = mapper(original, attributes);
        if (mapped !== original) {
          replacements.push({
            start: node.moduleSpecifier.getStart(sourceFile) + 1,
            end: node.moduleSpecifier.getEnd() - 1,
            text: mapped,
          });
        }
      }
    }

    // Dynamic import: import("specifier") or import("specifier", { with: { ... } })
    if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          const original = arg.text;
          const attributes = extractDynamicImportAttributes(node);
          const mapped = mapper(original, attributes);
          if (mapped !== original) {
            replacements.push({
              start: arg.getStart(sourceFile) + 1,
              end: arg.getEnd() - 1,
              text: mapped,
            });
          }
        }
      }
    }

    // Import type: typeof import("specifier") or import("specifier").Foo
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const literal = node.argument.literal;
      if (ts.isStringLiteral(literal)) {
        const original = literal.text;
        const attributes = extractImportAttributes(node.attributes);
        const mapped = mapper(original, attributes);
        if (mapped !== original) {
          replacements.push({
            start: literal.getStart(sourceFile) + 1,
            end: literal.getEnd() - 1,
            text: mapped,
          });
        }
      }
    }

    ts.forEachChild(node, visitNode);
  };

  visitNode(sourceFile);

  // Sort replacements in reverse order to avoid offset issues
  replacements.sort((a, b) => b.start - a.start);

  let result = source;
  for (const { start, end, text } of replacements) {
    result = result.slice(0, start) + text + result.slice(end);
  }

  return result;
};
