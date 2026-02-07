import { transpile, ts } from "./system.ts";
import {
  extractVariableStatistics,
  flattenStatements,
  joinFree,
} from "./extract-variable-statistics.ts";
import * as t from "../t.ts";

type XXXX = ts.LanguageServiceHost;

type Describe<T, _ extends string> = T;

const debug = false ? console.log : () => {};

export type PackageAttributes = {
  env: string;
  commit: t.Hash<t.yan.Commit>;
};

export type FunctionAttributes = {
  env: string;
  tracer?: { name?: string };
};

type Statement = {
  node: ts.Statement;
  declares: Map<
    string,
    { type: "function" | "block"; nodes: Set<ts.Identifier> }
  >;
  uses: Map<string, Set<ts.Identifier>>;
  dynamicImports: Array<{
    specifier: string;
    attributes: Record<string, string>;
    symbols: Array<string> | "*";
    target: string | null;
  }>;
  function?: boolean;
  target?: string;
};

type ParsedFunction = {
  kind: "function";
  name?: string;
  async: boolean;
  body: ts.ConciseBody;
  node: ts.FunctionExpression | ts.ArrowFunction;
};

type ParsedClass = {
  kind: "class";
  name?: string;
  members: ts.NodeArray<ts.ClassElement>;
  node: ts.ClassExpression;
};

interface BlockCtx {
  context: ts.TransformationContext;
  $E: ts.Identifier;
  $S: ts.Identifier;
  globals: Map<string, Set<ts.Identifier>>;
  dynamicPushed: Map<string, number>;
}

export interface SourceAnalysis {
  dynamicImports: Array<{
    specifier: string;
    attributes: Record<string, string>;
    symbols: Array<string> | "*";
    target: string | null;
  }>;

  symbols: Record<
    Describe<string, "declared name">,
    | ["local", Describe<number, "block number">]
    | [
        "import",
        Describe<string, "imported name">,
        Describe<string, "specifier">,
        Partial<PackageAttributes>,
      ]
  >;
  exports: Record<
    Describe<string, "exported name">,
    | ["local", Describe<string, "declared name">]
    | [
        "import",
        Describe<string, "declared name">,
        Describe<string, "specifier">,
        Partial<PackageAttributes>,
      ]
  >;
  blocks: Array<{
    target: "server" | "client";
    uses: Set<string>;
    dynamic: Set<number>;
  }>;

  reexports: [string, Partial<PackageAttributes>][];
}

const FORBIDDEN_GLOBALS = new Set([
  "eval",
  "Function",
  "import",
  "self",
  "globalThis",
  "window",
  "console",
  "Deno",
]);

const isWhitelistedGlobal = (name: string) => {
  if (FORBIDDEN_GLOBALS.has(name)) {
    return false;
  }

  if (name.startsWith("_")) {
    return false;
  }

  return true;
};

const UNDEFINED = ts.factory.createIdentifier("undefined");

/* creates identifier.name = value */
function makePropertyAssignmentExpression(
  identifier: ts.Identifier,
  name: string,
  value: ts.Expression,
): ts.Statement {
  return ts.factory.createExpressionStatement(
    ts.factory.createAssignment(
      ts.factory.createPropertyAccessExpression(identifier, name),
      value,
    ),
  );
}

/* create a = value */
function makeAssignmentExpression(name: ts.Identifier, value: ts.Expression) {
  return ts.factory.createExpressionStatement(
    ts.factory.createBinaryExpression(
      name,
      ts.factory.createToken(ts.SyntaxKind.EqualsToken),
      value,
    ),
  );
}

/* tells if a function is async */
function isAsync(
  node:
    | ts.FunctionExpression
    | ts.ArrowFunction
    | ts.MethodDeclaration
    | ts.FunctionDeclaration,
): boolean {
  return !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
}

/* removes export and default modifiers from a function */
function withoutExportish(mods: ts.NodeArray<ts.ModifierLike> | undefined) {
  return mods?.filter(
    (m) =>
      m.kind !== ts.SyntaxKind.Decorator &&
      m.kind !== ts.SyntaxKind.ExportKeyword &&
      m.kind !== ts.SyntaxKind.DefaultKeyword,
  );
}

/* returns an unique variable name */
const createUniqueSymbol = (name: string, symbols: Set<string>) => {
  if (!symbols.has(name)) return name;

  let i = 0;
  while (symbols.has(`${name}_${i}`)) {
    i++;
  }

  return `${name}_${i}`;
};

/* removes the export keyword from a statement */
const stripExportKeyword = (
  node: ts.Statement,
): [boolean | "default", ts.Statement] => {
  // variable declaration
  if (ts.isVariableStatement(node)) {
    // if export keyword is present
    if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      return [
        true,
        ts.factory.updateVariableStatement(
          node,
          node.modifiers?.filter((m) => m.kind !== ts.SyntaxKind.ExportKeyword),
          node.declarationList,
        ),
      ];
    }
  }

  // function declaration
  if (ts.isFunctionDeclaration(node)) {
    // if export keyword is present
    if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      return [
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
          ? "default"
          : true,
        ts.factory.updateFunctionDeclaration(
          node,
          withoutExportish(node.modifiers),
          node.asteriskToken,
          node.name,
          node.typeParameters,
          node.parameters,
          node.type,
          node.body,
        ),
      ];
    }
  }

  if (ts.isClassDeclaration(node)) {
    // if export keyword is present
    if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      return [
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
          ? "default"
          : true,
        ts.factory.updateClassDeclaration(
          node,
          withoutExportish(node.modifiers),
          node.name,
          node.typeParameters,
          node.heritageClauses,
          node.members,
        ),
      ];
    }
  }

  return [false, node];
};

/* takes a function or class declaration and transforms
 * it into an expression like
 * Env.foo = function () { }
 * Env.bar = class { }
 * Env.x = () => ()
 */
const transform = (
  node: ts.Node,
  $E: ts.Identifier,
): ts.Statement | undefined => {
  if (ts.isFunctionDeclaration(node) && node.name) {
    // function Foo() {}
    return makePropertyAssignmentExpression(
      $E,
      node.name.text,
      ts.factory.createFunctionExpression(
        node.modifiers as ts.Modifier[] | undefined,
        node.asteriskToken,
        undefined,
        node.typeParameters,
        node.parameters,
        node.type,
        node.body ?? ts.factory.createBlock([]),
      ),
    );
  }

  if (ts.isClassDeclaration(node) && node.name) {
    // class Foo {}
    return makePropertyAssignmentExpression(
      $E,
      node.name.text,
      ts.factory.createClassExpression(
        node.modifiers as ts.Modifier[] | undefined,
        undefined,
        node.typeParameters,
        node.heritageClauses,
        node.members,
      ),
    );
  }

  if (ts.isVariableStatement(node)) {
    // const x = function() {}, y = class {}, z = () => {}
    const decl = node.declarationList.declarations[0];
    if (
      decl &&
      ts.isIdentifier(decl.name) &&
      decl.initializer &&
      (ts.isArrowFunction(decl.initializer) ||
        ts.isFunctionExpression(decl.initializer))
    ) {
      return makePropertyAssignmentExpression(
        $E,
        decl.name.text,
        decl.initializer,
      );
    }
  }

  return undefined;
};

/* given some statements and it's async type
 * returns the attributes of the function
 * in strict mode throws error for is client in async and for is server in sync
 */
function parseLeadingDirectives(
  statements: ts.NodeArray<ts.Statement>,
  isAsync: boolean,
  strict: boolean,
): Partial<FunctionAttributes> {
  const attrs: Partial<FunctionAttributes> = {};

  for (const stmt of statements) {
    if (ts.isEmptyStatement(stmt)) continue;

    if (
      !ts.isExpressionStatement(stmt) ||
      !ts.isStringLiteral(stmt.expression)
    ) {
      break;
    }

    const [use, kind, ...rest] = stmt.expression.text.trim().split(/[\s:]+/);
    if (use !== "use") break;

    // console.log("===============================");

    // console.log(["use", kind, ...rest]);

    switch (kind) {
      case "tracer": {
        const name = rest.join(" ") || undefined;
        if (
          attrs.tracer &&
          strict &&
          (attrs.tracer.name ?? "") !== (name ?? "")
        ) {
          throw new t.Surprise("unexpected: multiple tracer directives");
        }
        attrs.tracer = name ? { name } : {};
        break;
      }
      case "server": {
        if (strict && !isAsync) {
          throw new t.Surprise(
            "unexpected: use server in a non-async function",
          );
        }
        attrs.env = "server";
        break;
      }
      case "client": {
        if (strict && isAsync) {
          throw new t.Surprise("unexpected: use client in an async function");
        }
        attrs.env = "client";
        break;
      }
      case "worker": {
        if (strict && !isAsync) {
          throw new t.Surprise("unexpected: use worker in an async function");
        }

        attrs.env = `worker:${rest.join(" ")}`;
        break;
      }
    }
  }
  return attrs;
}

/* function attributes without strict */
const getTrace = (body: ts.ConciseBody) =>
  ts.isBlock(body) ? parseLeadingDirectives(body.statements, true, false) : {};

/* function attributes with strict */
const parseFunctionAttributes = (_async: boolean, body: ts.ConciseBody) =>
  ts.isBlock(body) ? parseLeadingDirectives(body.statements, _async, true) : {};

/* parses the file attributes */
const parseFileAttributes = (
  sourceFile: ts.SourceFile,
): Partial<FunctionAttributes> =>
  parseLeadingDirectives(sourceFile.statements, false, false);

/* Given a function or class declaration
 * removes the export or default clauses
 * and procudes a function or class expression
 * also returns other data like
 * name: declaration name (maybe default)
 * type: class or function
 * ...
 */
const parse = (
  statement: ts.Statement,
): ParsedFunction | ParsedClass | null => {
  // export function foo() {} -> function Foo() {}
  // export default function() {} -> function default() {}
  // export default function foo() {} -> function Foo() {}
  if (ts.isFunctionDeclaration(statement) && statement.body !== undefined) {
    return {
      kind: "function",
      name: statement.name?.text,
      async: isAsync(statement),
      body: statement.body,
      node: ts.factory.createFunctionExpression(
        withoutExportish(statement.modifiers),
        statement.asteriskToken,
        statement.name,
        statement.typeParameters,
        statement.parameters,
        statement.type,
        statement.body,
      ),
    };
  }

  // export class Foo {}
  // export default class Foo {}
  if (ts.isClassDeclaration(statement)) {
    return {
      kind: "class",
      name: statement.name?.text,
      members: statement.members,
      node: ts.factory.createClassExpression(
        withoutExportish(statement.modifiers),
        statement.name,
        statement.typeParameters,
        statement.heritageClauses,
        statement.members,
      ),
    };
  }

  // export const foo = function() {}
  // const foo = () => {}
  // const foo = function foo() {}
  if (
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.length === 1
  ) {
    const declaration = statement.declarationList.declarations[0];

    if (
      declaration.initializer !== undefined &&
      (ts.isArrowFunction(declaration.initializer) ||
        ts.isFunctionExpression(declaration.initializer)) &&
      ts.isIdentifier(declaration.name)
    ) {
      return {
        kind: "function",
        name: declaration.name.text,
        async: isAsync(declaration.initializer),
        body: declaration.initializer.body,
        node: declaration.initializer,
      };
    }

    if (
      declaration.initializer !== undefined &&
      ts.isClassExpression(declaration.initializer) &&
      ts.isIdentifier(declaration.name)
    ) {
      return {
        kind: "class",
        name: declaration.name.text,
        members: declaration.initializer.members,
        node: declaration.initializer,
      };
    }
  }

  return null;
};

/* creates the module given a block of code and it's block number */
const createModule = (
  module: ts.Expression,
  blockId: number,
  block: ts.Block | ts.FunctionExpression | ts.ArrowFunction,
  uses: Map<string, Set<ts.Identifier>>,
  ctx: BlockCtx,
) => {
  return ts.factory.createCallExpression(
    ts.factory.createPropertyAccessExpression(module, "block"),
    undefined,
    [
      ts.factory.createNumericLiteral(blockId),
      ts.factory.createArrowFunction(
        undefined,
        undefined,
        [
          ts.factory.createParameterDeclaration(
            undefined,
            undefined,
            ctx.$E,
            undefined,
            undefined,
            undefined,
          ),
          ts.factory.createParameterDeclaration(
            undefined,
            undefined,
            ctx.$S,
            undefined,
            undefined,
            undefined,
          ),
        ],
        undefined,
        ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        traverse(block, uses, ctx),
      ),
    ],
  );
};

/* creates the final module statement */
const createModuleStatement = (use: (_: ts.Expression) => ts.Expression) => {
  const newModule = ts.factory.createIdentifier("Module");

  return ts.factory.createExportDefault(
    ts.factory.createArrowFunction(
      undefined,
      undefined,
      [
        ts.factory.createParameterDeclaration(
          undefined,
          undefined,
          "Module",
          undefined,
          undefined,
          undefined,
        ),
      ],
      undefined,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      use(newModule),
    ),
  );
};

/* create block for immediate group */
const withImmediateGroup = (
  blockId: number,
  module: ts.Expression,
  group: Statement[],
  ctx: BlockCtx,
) => {
  const topStatements: ts.Statement[] = [];
  const restStatements: ts.Statement[] = [];

  for (const statement of group) {
    const node = statement.node;

    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      const parsed = parse(node);

      if (parsed === null) {
        throw new t.Surprise("expected function or class statement");
      }

      const parsedNode =
        parsed.name === undefined ? node : (transform(node, ctx.$E) ?? node);

      if (parsed.kind === "function") {
        topStatements.push(parsedNode);
      } else {
        restStatements.push(parsedNode);
      }
    } else if (ts.isVariableStatement(node)) {
      const flags = node.declarationList.flags;
      const isVar = (flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)) === 0;

      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const varName = decl.name;
          const initializer = decl.initializer;

          if (isVar) {
            topStatements.push(makeAssignmentExpression(varName, UNDEFINED));
          }

          if (initializer) {
            restStatements.push(makeAssignmentExpression(varName, initializer));
          }
        } else if (
          ts.isObjectBindingPattern(decl.name) ||
          ts.isArrayBindingPattern(decl.name)
        ) {
          if (isVar) {
            const declared = findDeclaredInBindingPattern(decl.name);
            for (const name of declared) {
              topStatements.push(makeAssignmentExpression(name, UNDEFINED));
            }
            restStatements.push(statement.node);
            for (const name of declared) {
              restStatements.push(
                makeAssignmentExpression(
                  name,
                  ts.factory.createIdentifier(name.text),
                ),
              );
            }
          } else {
            restStatements.push(statement.node);
            const declared = findDeclaredInBindingPattern(decl.name);
            for (const name of declared) {
              restStatements.push(
                makeAssignmentExpression(
                  name,
                  ts.factory.createIdentifier(name.text),
                ),
              );
            }
          }
        }
      }
    } else {
      restStatements.push(statement.node);
    }
  }

  const uses = joinFree([
    ...group.flatMap((statement) => statement.uses),
    ...group.map(
      (statement) =>
        new Map(
          Array.from(statement.declares.entries()).map(
            ([name, { nodes }]) => [name, nodes] as const,
          ),
        ),
    ),
  ]);

  const statements = topStatements;

  statements.push(
    ts.factory.createReturnStatement(
      ts.factory.createArrowFunction(
        [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
        undefined,
        [],
        undefined,
        ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        ts.factory.createBlock(restStatements, true),
      ),
    ),
  );

  return createModule(
    module,
    blockId,
    ts.factory.createBlock(statements, true),
    uses,
    ctx,
  );
};

/* creates a module statement for function statements */
const withFunctionStatement = (
  blockId: number,
  module: ts.Expression,
  statement: Statement,
  ctx: BlockCtx,
) => {
  /**
   * <module>.function(<declares>, [<uses>], $E => <node>)
   */

  const fn = parse(statement.node);

  if (fn === null || fn.kind !== "function") {
    throw new t.Surprise("expected function statement");
  }

  const fnNode =
    fn.name === undefined
      ? fn.node
      : ts.factory.createBlock([
          transform(statement.node, ctx.$E) ?? statement.node,
        ]);

  const uses = joinFree([
    statement.uses,
    new Map(
      Array.from(statement.declares.entries()).map(
        ([name, { nodes }]) => [name, nodes] as const,
      ),
    ),
  ]);

  return createModule(module, blockId, fnNode, uses, ctx);
};

const extractImportAttributes = (node?: ts.ImportAttributes) => {
  const attributes: Partial<PackageAttributes> = {};

  if (node) {
    for (const attribute of node.elements) {
      if (!ts.isStringLiteral(attribute.value)) {
        // skip non-string attributes
        continue;
      }

      Reflect.set(attributes, attribute.name.text, attribute.value.text);
    }
  }

  return attributes;
};

const extractImportDeclaration = (node: ts.ImportDeclaration) => {
  const attributes = extractImportAttributes(node.attributes);

  const symbols: Record<string, string> = {};

  if (!ts.isStringLiteral(node.moduleSpecifier)) {
    throw new t.Surprise("unexpected: moduleSpecifier is not a string literal");
  }

  const specifier = node.moduleSpecifier.text;

  if (!node.importClause) {
    return [specifier, attributes, symbols] as const;
  }

  if (node.importClause.name) {
    symbols[node.importClause.name.text] = "default";
  }

  if (node.importClause.namedBindings) {
    if (ts.isNamespaceImport(node.importClause.namedBindings)) {
      symbols[node.importClause.namedBindings.name.text] = "*";
    } else {
      for (const element of node.importClause.namedBindings.elements) {
        symbols[element.name.text] =
          element.propertyName?.text ?? element.name.text;
      }
    }
  }

  return [specifier, attributes, symbols] as const;
};

const findDeclaredInBindingPattern = (
  node: ts.BindingPattern,
): ts.Identifier[] =>
  node.elements.flatMap((element) => {
    if (ts.isOmittedExpression(element)) {
      return [];
    }

    if (ts.isIdentifier(element.name)) {
      return [element.name];
    }

    if (ts.isObjectBindingPattern(element.name)) {
      return findDeclaredInBindingPattern(element.name);
    }

    if (ts.isArrayBindingPattern(element.name)) {
      return findDeclaredInBindingPattern(element.name);
    }

    return [];
  });

const traverse = <T extends ts.Node>(
  node: T,
  uses: Map<string, Set<ts.Identifier>>,
  ctx: BlockCtx,
): T => {
  const { context, $E, $S } = ctx;
  const visitor = (node: ts.Node): ts.Node => {
    if (ts.isIdentifier(node)) {
      const name = node.text;
      if (uses.get(name)?.has(node)) {
        return ts.factory.createPropertyAccessExpression($E, node);
      }
      if (ctx.globals.get(name)?.has(node) && !isWhitelistedGlobal(name)) {
        return ts.factory.createPropertyAccessExpression($S, node.text);
      }
    }

    if (ts.isShorthandPropertyAssignment(node)) {
      const name = node.name.text;

      if (uses.get(name)?.has(node.name)) {
        return ts.factory.createPropertyAssignment(
          node.name,
          ts.factory.createPropertyAccessExpression($E, node.name),
        );
      } else if (
        ctx.globals.get(name)?.has(node.name) &&
        !isWhitelistedGlobal(name)
      ) {
        return ts.factory.createPropertyAssignment(
          node.name,
          ts.factory.createPropertyAccessExpression($S, node.name),
        );
      }
    }

    // import.<meta> -> $S.import.<meta>
    if (
      ts.isMetaProperty(node) &&
      node.keywordToken === ts.SyntaxKind.ImportKeyword
    ) {
      // emit $S.import.<node.name>
      return ts.factory.createPropertyAccessExpression(
        ts.factory.createPropertyAccessExpression($S, "import"),
        node.name,
      );
    }

    // dynamic imports
    const dynamicImport = parseDynamicImport(node);
    if (dynamicImport !== null) {
      return ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression($S, "dynamic"),
        undefined,
        [
          ts.factory.createNumericLiteral(
            ctx.dynamicPushed.get(JSON.stringify(dynamicImport))!,
          ),
        ],
      );
    }

    if (ts.isBindingElement(node)) {
      return ts.factory.createBindingElement(
        node.dotDotDotToken,
        node.propertyName && ts.isComputedPropertyName(node.propertyName)
          ? (ts.visitNode(
              node.propertyName,
              visitor,
            ) as ts.ComputedPropertyName)
          : node.propertyName,
        ts.isIdentifier(node.name)
          ? node.name
          : (ts.visitNode(node.name, visitor) as ts.Identifier),
        node.initializer &&
          (ts.visitNode(node.initializer, visitor) as ts.Expression),
      );
    }

    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)) &&
      node.body &&
      ts.isBlock(node.body) &&
      getTrace(node.body).tracer
    ) {
      const fnNode = ts.visitEachChild(node, visitor, context);
      if (!fnNode.body) {
        return fnNode;
      }

      const { name } = getTrace(node.body).tracer!;

      const arrow = ts.factory.createArrowFunction(
        isAsync(node)
          ? [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)]
          : undefined,
        undefined,
        [],
        undefined,
        ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        fnNode.body,
      );

      const body = ts.factory.createBlock(
        [
          ts.factory.createReturnStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier("Self"),
                "trace",
              ),
              undefined,
              name ? [ts.factory.createStringLiteral(name), arrow] : [arrow],
            ),
          ),
        ],
        true,
      );

      if (ts.isFunctionDeclaration(node)) {
        return ts.factory.updateFunctionDeclaration(
          node,
          node.modifiers,
          node.asteriskToken,
          node.name,
          node.typeParameters,
          node.parameters,
          node.type,
          body,
        );
      }
      if (ts.isFunctionExpression(node)) {
        return ts.factory.updateFunctionExpression(
          node,
          node.modifiers,
          node.asteriskToken,
          node.name,
          node.typeParameters,
          node.parameters,
          node.type,
          body,
        );
      }
      if (ts.isArrowFunction(node)) {
        return ts.factory.updateArrowFunction(
          node,
          node.modifiers,
          node.typeParameters,
          node.parameters,
          node.type,
          node.equalsGreaterThanToken,
          body,
        );
      }
      if (ts.isMethodDeclaration(node)) {
        return ts.factory.updateMethodDeclaration(
          node,
          node.modifiers,
          node.asteriskToken,
          node.name,
          node.questionToken,
          node.typeParameters,
          node.parameters,
          node.type,
          body,
        );
      }
    }

    return ts.visitEachChild(node, visitor, context);
  };

  return visitor(node) as T;
};

const groupStatements = (statements: Statement[]) => {
  const symbols = new Map<string, number>();
  for (let i = 0; i < statements.length; i++) {
    for (const symbol of statements[i].declares.keys()) {
      symbols.set(symbol, i);
    }
  }

  const uses = new Map<number, Set<number>>();

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];

    // find all other statements that declares symbols this statement uses
    for (const symbol of statement.uses.keys()) {
      const j = symbols.get(symbol);
      if (j === undefined) {
        // global symbol
        continue;
      }

      if (j === i) {
        throw new Error("self reference");
      }

      if (!uses.has(i)) {
        uses.set(i, new Set());
      }
      uses.get(i)!.add(j);
    }
  }

  // color each statement
  const color = new Map<number, number>();
  const colors = new Map<
    number,
    {
      members: Set<number>;
      touches: Set<number>;
    }
  >();

  for (let i = 0; i < statements.length; i++) {
    if (color.has(i)) {
      continue;
    }

    const statement = statements[i];

    if (statement.function) {
      continue;
    }

    const queue = [i];
    const colorIndex = color.size;
    if (!colors.has(colorIndex)) {
      colors.set(colorIndex, {
        members: new Set(),
        touches: new Set(),
      });
    }
    const currentColor = colors.get(colorIndex)!;

    while (queue.length > 0) {
      const j = queue.pop()!;
      color.set(j, colorIndex);
      currentColor.members.add(j);

      for (const k of uses.get(j) ?? []) {
        if (statements[k].function && statements[k].target) {
          // continue function with `use ${env}`
          continue;
        }

        if (color.has(k)) {
          currentColor.touches.add(color.get(k)!);
          colors.get(color.get(k)!)!.touches.add(colorIndex);
          continue;
        }

        queue.push(k);
      }
    }
  }

  const immediates = [] as (typeof statements)[];
  const functions = [] as typeof statements;

  // dfs over colors to find all immediate groups
  const visited = new Set<number>();
  for (let i = 0; i < statements.length; i++) {
    if (!color.has(i)) {
      functions.push(statements[i]);
      continue;
    }

    const currentColor = color.get(i)!;

    if (visited.has(currentColor)) {
      continue;
    }

    const queue = [currentColor];
    const group = new Set<number>();

    while (queue.length > 0) {
      const c = queue.pop()!;
      visited.add(c);

      // add all members of this color to the group
      for (const j of colors.get(c)!.members) {
        group.add(j);
      }

      // add all touched colors to the queue
      for (const j of colors.get(c)!.touches) {
        if (!visited.has(j)) {
          queue.push(j);
        }
      }
    }

    immediates.push(
      Array.from(group)
        .sort((a, b) => a - b)
        .map((i) => statements[i]),
    );
  }

  return { immediates, functions };
};

const parseDynamicImport = (node: ts.Node) => {
  if (!ts.isCallExpression(node)) {
    return null;
  }

  if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) {
    return null;
  }

  if (
    !ts.isStringLiteral(node.arguments[0]) &&
    !ts.isNoSubstitutionTemplateLiteral(node.arguments[0])
  ) {
    return null;
  }

  const attributesNode =
    node.arguments[1] !== undefined &&
    ts.isObjectLiteralExpression(node.arguments[1])
      ? node.arguments[1].properties.find(
          (property) =>
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === "with",
        )
      : undefined;

  const attributes: Record<string, string> =
    attributesNode !== undefined &&
    ts.isPropertyAssignment(attributesNode) &&
    ts.isObjectLiteralExpression(attributesNode.initializer)
      ? Object.fromEntries(
          attributesNode.initializer.properties.flatMap((property) => {
            if (!ts.isPropertyAssignment(property)) {
              return [];
            }

            if (!ts.isStringLiteral(property.initializer)) {
              return [];
            }

            if (!ts.isIdentifier(property.name)) {
              return [];
            }

            return [[property.name.text, property.initializer.text]];
          }),
        )
      : {};

  const symbolsNode =
    node.arguments[1] !== undefined &&
    ts.isObjectLiteralExpression(node.arguments[1])
      ? node.arguments[1].properties.find(
          (property) =>
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === "symbols",
        )
      : undefined;

  const symbols =
    symbolsNode !== undefined &&
    ts.isPropertyAssignment(symbolsNode) &&
    ts.isArrayLiteralExpression(symbolsNode.initializer)
      ? symbolsNode.initializer.elements.flatMap((element) => {
          if (!ts.isStringLiteral(element)) {
            return [];
          }

          return [element.text];
        })
      : null;

  const targetNode =
    node.arguments[1] !== undefined &&
    ts.isObjectLiteralExpression(node.arguments[1])
      ? node.arguments[1].properties.find(
          (property) =>
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === "target",
        )
      : null;

  return {
    specifier: node.arguments[0].text,
    attributes: Object.fromEntries(
      Object.entries(attributes).sort((a, b) => a[0].localeCompare(b[0])),
    ),
    symbols: symbols?.sort((a, b) => a.localeCompare(b)) ?? ("*" as const),
    target:
      !!targetNode &&
      ts.isPropertyAssignment(targetNode) &&
      ts.isStringLiteral(targetNode.initializer)
        ? targetNode.initializer.text
        : null,
  };
};

const extractDynamicImports = (
  statement: ts.Statement,
  context: ts.TransformationContext,
) => {
  const dynamicImports: Array<{
    specifier: string;
    attributes: Record<string, string>;
    symbols: Array<string> | "*";
    target: string | null;
  }> = [];

  const visitor = (node: ts.Node) => {
    const result = parseDynamicImport(node);

    if (result !== null) {
      dynamicImports.push(result);
    }

    return ts.visitEachChild(node, visitor, context);
  };

  ts.visitEachChild(statement, visitor, context);

  return dynamicImports;
};

const collectStatements = (
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  analysis: SourceAnalysis,
) => {
  const statements = sourceFile.statements
    .flatMap(flattenStatements)
    .flatMap((statement) => {
      if (ts.isImportDeclaration(statement)) {
        const [specifier, attributes, imports] =
          extractImportDeclaration(statement);
        for (const [key, as] of Object.entries(imports)) {
          analysis.symbols[key] = ["import", as, specifier, attributes];
        }

        // import statements do not declare or use any symbols
        return [];
      }

      if (ts.isExportDeclaration(statement)) {
        // eg: export * from "module";
        if (!statement.moduleSpecifier) {
          if (
            !statement.exportClause ||
            ts.isNamespaceExport(statement.exportClause)
          ) {
            // export * from "module";
            // export * as foo from "module";
            return [];
          }

          for (const element of statement.exportClause.elements) {
            const name = element.propertyName?.text ?? element.name.text;
            analysis.exports[element.name.text] = ["local", name];
          }

          // export { ... } from "module";
          return [];
        }

        if (!ts.isStringLiteral(statement.moduleSpecifier)) {
          throw new t.Surprise("moduleSpecifier is not a string literal");
        }

        const specifier = statement.moduleSpecifier.text;

        if (statement.exportClause) {
          const names: Record<string, string> = ts.isNamespaceExport(
            statement.exportClause,
          )
            ? { [statement.exportClause.name.text]: "*" }
            : Object.fromEntries(
                statement.exportClause.elements.map((element) => [
                  element.name.text,
                  element.propertyName?.text ?? element.name.text,
                ]),
              );

          for (const [as, name] of Object.entries(names)) {
            analysis.exports[as] = [
              "import",
              name,
              specifier,
              extractImportAttributes(statement.attributes),
            ];
          }
        } else {
          analysis.reexports.push([
            specifier,
            extractImportAttributes(statement.attributes),
          ]);
        }

        return [];
      }

      const stat = extractVariableStatistics(statement, context);
      const dynamicImports = extractDynamicImports(statement, context);

      return [
        {
          node: statement,
          declares: stat.declared,
          uses: stat.free,
          dynamicImports,
        },
      ];
    });

  const declared = new Set<string>();
  const free = new Set<string>();
  const globals = new Map<string, Set<ts.Identifier>>();

  // add all imported symbols to declared
  for (const [key, value] of Object.entries(analysis.symbols)) {
    if (value[0] === "import") {
      declared.add(key);
    }
  }

  // add all declared symbols to declared
  for (const statement of statements) {
    for (const name of statement.declares.keys()) {
      declared.add(name);
    }
  }

  for (const statement of statements) {
    for (const name of statement.uses.keys()) {
      if (declared.has(name)) {
        free.add(name);
        continue;
      }

      for (const node of statement.uses.get(name)!) {
        if (!globals.has(name)) {
          globals.set(name, new Set());
        }

        globals.get(name)!.add(node);
      }
      statement.uses.delete(name);
    }
  }

  return {
    statements,
    declared,
    free,
    globals,
  };
};

const group = (
  statements: Statement[],
  analysis: SourceAnalysis,
  $E: ts.Identifier,
) => {
  return groupStatements(
    statements
      .flatMap((statement) => {
        if (ts.isExportAssignment(statement.node)) {
          // eg: export default <expression>;

          if (statement.node.isExportEquals) {
            throw new t.Surprise("unexpected: export equals");
          }

          if (ts.isIdentifier(statement.node.expression)) {
            // simply add the identifier to exports
            analysis.exports["default"] = [
              "local",
              statement.node.expression.text,
            ];
            return [];
          }

          analysis.exports["default"] = ["local", "default"];
          statement.declares.set("default", {
            type: "block",
            nodes: new Set([]),
          });

          return [
            {
              ...statement,
              node:
                // <$E>.default = <expression>
                ts.factory.createExpressionStatement(
                  ts.factory.createAssignment(
                    ts.factory.createPropertyAccessExpression($E, "default"),
                    statement.node.expression,
                  ),
                ),
            },
          ];
        }

        if (
          ts.isFunctionDeclaration(statement.node) &&
          ts.getCombinedModifierFlags(statement.node) &
            ts.ModifierFlags.Default &&
          statement.node.name === undefined
        ) {
          // export function foo() {}
          // export default function() {}
          analysis.exports["default"] = ["local", "default"];
          statement.declares.set("default", {
            type: "block",
            nodes: new Set([]),
          });

          return [
            {
              ...statement,
              node: ts.factory.createFunctionDeclaration(
                withoutExportish(statement.node.modifiers),
                statement.node.asteriskToken,
                statement.node.name ?? "default",
                statement.node.typeParameters,
                statement.node.parameters,
                statement.node.type,
                statement.node.body,
              ),
            },
          ];
        }

        if (
          ts.isClassDeclaration(statement.node) &&
          ts.getCombinedModifierFlags(statement.node) &
            ts.ModifierFlags.Default &&
          statement.node.name === undefined
        ) {
          // export class Foo {}
          analysis.exports["default"] = ["local", "default"];
          statement.declares.set("default", {
            type: "block",
            nodes: new Set([]),
          });

          return [
            {
              ...statement,
              node: ts.factory.createClassDeclaration(
                withoutExportish(statement.node.modifiers),
                statement.node.name ?? "default",
                statement.node.typeParameters,
                statement.node.heritageClauses,
                statement.node.members,
              ),
            },
          ];
        }

        return [statement];
      })
      .map((statement) => {
        const fn = parse(statement.node);
        const [exported, node] = stripExportKeyword(statement.node);
        if (exported) {
          // if default export
          if (exported === "default") {
            analysis.exports["default"] = [
              "local",
              fn === null ? "default" : (fn.name ?? "default"),
            ];
          } else {
            // export all declared symbols
            for (const name of statement.declares.keys()) {
              analysis.exports[name] = ["local", name];
            }
          }
        }

        if (fn === null) {
          return {
            ...statement,
            node,
          };
        }
        if (fn.kind === "class") {
          const cls = fn;
          if (cls?.name !== undefined && !statement.declares.has(cls.name)) {
            throw new Error(`unexpected: class name ${cls.name} not declared`);
          }

          return {
            ...statement,
            node,
          };
        }

        if (fn?.name !== undefined && !statement.declares.has(fn.name)) {
          throw new Error(`unexpected: function name ${fn.name} not declared`);
        }

        const attibutes = parseFunctionAttributes(fn.async, fn.body);

        return {
          ...statement,
          node,
          function: true,
          target: attibutes.env,
        };
      }),
  );
};

const analyzeSourceFile = (
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  target: Partial<FunctionAttributes>,
) => {
  if (!target.env) {
    throw t.Surprise.with`target not mentioned for compilation`;
  }
  const analysis: SourceAnalysis = {
    dynamicImports: [],
    symbols: {},
    exports: {},
    blocks: [],
    reexports: [],
  };

  const { statements, declared, free, globals } = collectStatements(
    sourceFile,
    context,
    analysis,
  );

  const allSymbols = new Set([...declared, ...free, ...globals.keys()]);
  const $E = ts.factory.createIdentifier(createUniqueSymbol("Env", allSymbols));
  const $S = ts.factory.createIdentifier(
    createUniqueSymbol("Self", allSymbols),
  );

  const { immediates, functions } = group(statements, analysis, $E);

  // let blockId = 0;

  const dynamicPushed: Map<string, number> = new Map();

  const ctx: BlockCtx = {
    context,
    $E,
    $S,
    globals,
    dynamicPushed,
  };
  const fileAttributes = parseFileAttributes(sourceFile);

  const withImmediates = (module: ts.Expression) =>
    immediates.reduce(
      (acc, group) => {
        const block = {
          uses: new Set<string>(),
          dynamic: new Set<number>(),
          target: (fileAttributes.env ?? target.env!) as "client" | "server",
        };

      const index = analysis.blocks.length;
      analysis.blocks.push(block);

      for (const statement of group) {
        for (const name of statement.uses.keys()) {
          block.uses.add(name);
        }
      }
      for (const statement of group) {
        for (const name of statement.declares.keys()) {
          block.uses.delete(name);
          analysis.symbols[name] = ["local", index];
        }
      }
      for (const statement of group) {
        for (const item of statement.dynamicImports) {
          const json = JSON.stringify(item);
          if (!dynamicPushed.has(json)) {
            dynamicPushed.set(json, analysis.dynamicImports.length);
            analysis.dynamicImports.push(item);
          }
          block.dynamic.add(dynamicPushed.get(json)!);
        }
      }

      return withImmediateGroup(index, acc, group, ctx);
    }, module);

  const withFunctions = (module: ts.Expression) =>
    functions.reduce(
      (acc, statement) => {
        const block = {
          uses: new Set<string>(),
          dynamic: new Set<number>(),
          target: (statement.target ??
            fileAttributes.env ?? target.env!) as "client" | "server",
        };
        const index = analysis.blocks.length;
        analysis.blocks.push(block);

      for (const name of statement.uses.keys()) {
        block.uses.add(name);
      }
      for (const name of statement.declares.keys()) {
        block.uses.delete(name);
        analysis.symbols[name] = ["local", index];
      }
      for (const item of statement.dynamicImports) {
        const json = JSON.stringify(item);
        if (!dynamicPushed.has(json)) {
          dynamicPushed.set(json, analysis.dynamicImports.length);
          analysis.dynamicImports.push(item);
        }
        block.dynamic.add(dynamicPushed.get(json)!);
      }

      return withFunctionStatement(index, acc, statement, ctx);
    }, module);

  // remove all declared symbols from free
  for (const name of declared) {
    free.delete(name);
  }

  return {
    analysis,
    sourceFile: ts.factory.updateSourceFile(
      sourceFile,
      [
        createModuleStatement((module) =>
          withFunctions(withImmediates(module)),
        ),
      ],
      sourceFile.isDeclarationFile,
      sourceFile.referencedFiles,
      sourceFile.typeReferenceDirectives,
      sourceFile.hasNoDefaultLib,
      sourceFile.libReferenceDirectives,
    ),
  };
};

export const analyze = (
  path: `/${string}`,
  content: string,
  target: Partial<PackageAttributes>,
): { analysis: SourceAnalysis; transpiled: string } => {
  let analysis: SourceAnalysis | undefined;

  debug("=== source ===");
  debug(content);

  const transpiled = transpile(path, content, {
    compilerOptions: {
      removeComments: false,
    },
    transformers: {
      after: [
        (program, context) => (sourceFile) => {
          const result = analyzeSourceFile(sourceFile, context, target);
          analysis = result.analysis;
          return result.sourceFile;
        },
      ],
    },
  });

  if (analysis === undefined) {
    throw new t.Surprise("unexpected: analysis is undefined");
  }

  debug("=== analysis ===");
  debug(analysis);
  debug("=== transpiled ===");
  debug(transpiled.content);
  debug("=== end ===");

  return { analysis: analysis, transpiled: transpiled.content };
};
