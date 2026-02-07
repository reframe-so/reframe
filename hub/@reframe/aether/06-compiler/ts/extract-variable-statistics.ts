import { ts } from ".//system.ts";
import { ASTSurprise } from "./surprise.ts";

const entries = Object.entries(ts.SyntaxKind) as [string, number | string][];

function getSyntaxKindName(kind: ts.SyntaxKind): string {
  const matchingKeys = entries.filter(
    ([, value]) => typeof value === "number" && value === kind,
  );

  const bestKey =
    matchingKeys.find(
      ([key]) => !key.startsWith("First") && !key.startsWith("Last"),
    ) ??
    // fallback to first if all are sentinel
    matchingKeys[0];

  return bestKey ? bestKey[0] : "Unknown";
}

const wrap = <T extends any[]>(
  fn: (...args: T) => {
    declared: Map<
      string,
      { type: "function" | "block"; nodes: Set<ts.Identifier> }
    >;
    free: Map<string, Set<ts.Identifier>>;
  },
) => {
  return (...args: T) => {
    const { declared, free } = fn(...args);

    for (const [name] of declared) {
      if (!free.has(name)) {
        continue;
      }
      for (const st of free.get(name)!) {
        declared.get(name)!.nodes.add(st);
      }

      free.delete(name);
    }

    return {
      declared,
      free,
    };
  };
};

export const flattenStatements = (node: ts.Statement): ts.Statement[] => {
  if (ts.isVariableStatement(node)) {
    const statements: ts.VariableStatement[] = [];

    for (const declaration of node.declarationList.declarations) {
      statements.push(
        ts.factory.createVariableStatement(
          node.modifiers,
          ts.factory.createVariableDeclarationList(
            [declaration],
            node.declarationList.flags,
          ),
        ),
      );
    }

    return statements;
  }

  return [node];
};

export const combine = (
  parts: Array<{
    declared: Map<
      string,
      { type: "function" | "block"; nodes: Set<ts.Identifier> }
    >;
    free: Map<string, Set<ts.Identifier>>;
  }>,
) => {
  const declared: Map<
    string,
    { type: "function" | "block"; nodes: Set<ts.Identifier> }
  > = new Map();
  const free_ = parts.map((part) => part.free);

  for (const part of parts) {
    for (const [name, { type, nodes }] of part.declared) {
      // if already declared, only set if the type is `function`
      if (!declared.has(name) || type === "function") {
        declared.set(name, { type, nodes });
      }
    }

    free_.push(part.free);
  }

  const free = joinFree(free_);

  // remove all declared variables from free
  for (const [name] of declared) {
    if (!free.has(name)) {
      continue;
    }
    for (const st of free.get(name)!) {
      declared.get(name)!.nodes.add(st);
    }
    free.delete(name);
  }

  return {
    declared,
    free,
  };
};

const joinSets = <T>(sets: Set<T>[]): Set<T> =>
  sets.reduce((acc, set) => {
    for (const item of set) {
      acc.add(item);
    }
    return acc;
  }, new Set());

const joinDeclaredWithoutType = (
  declared: Map<string, Set<ts.Identifier>[]>,
): Map<string, Set<ts.Identifier>> => {
  return new Map(
    Array.from(declared.entries()).map(
      ([name, identifiers]): [string, Set<ts.Identifier>] => [
        name,
        joinSets(identifiers),
      ],
    ),
  );
};

const joinDeclared = (
  declared: Map<
    string,
    { type: "function" | "block"; nodes: Set<ts.Identifier>[] }
  >,
): Map<string, { type: "function" | "block"; nodes: Set<ts.Identifier> }> => {
  return new Map(
    Array.from(declared.entries()).map(
      ([name, { type, nodes }]): [
        string,
        { type: "function" | "block"; nodes: Set<ts.Identifier> },
      ] => [name, { type, nodes: joinSets(nodes) }],
    ),
  );
};

export const joinFree = (
  maps: Map<string, Set<ts.Identifier>>[],
): Map<string, Set<ts.Identifier>> => {
  if (maps.length === 0) {
    return new Map();
  }

  const result: Map<string, Set<ts.Identifier>[]> = new Map();

  for (const map of maps) {
    for (const [name, identifiers] of map) {
      if (!result.has(name)) {
        result.set(name, []);
      }
      result.get(name)?.push(identifiers);
    }
  }

  return new Map(
    Array.from(result.entries()).map(
      ([name, identifiers]): [string, Set<ts.Identifier>] => [
        name,
        joinSets(identifiers),
      ],
    ),
  );
};

const extractBindingNames = (
  bindingName: ts.BindingName,
  context: ts.TransformationContext,
): {
  declared: Map<string, Set<ts.Identifier>>;
  free: Map<string, Set<ts.Identifier>>;
} => {
  const declared_: Map<string, Set<ts.Identifier>[]> = new Map();
  const free_: Map<string, Set<ts.Identifier>>[] = [];

  if (ts.isObjectBindingPattern(bindingName)) {
    for (const element of bindingName.elements) {
      const part = extractBindingNames(element.name, context);

      for (const [name] of part.declared) {
        if (!declared_.has(name)) {
          declared_.set(name, []);
        }
        declared_.get(name)!.push(part.declared.get(name)!);
      }

      free_.push(part.free);

      if (element.initializer !== undefined) {
        free_.push(extractFreeVariables(element.initializer, context));
      }

      if (element.propertyName) {
        if (ts.isComputedPropertyName(element.propertyName)) {
          free_.push(
            extractFreeVariables(element.propertyName.expression, context),
          );
        } else {
          free_.push(extractFreeVariables(element.propertyName, context));
        }
      }
    }
  }

  if (ts.isArrayBindingPattern(bindingName)) {
    for (const element of bindingName.elements) {
      if (ts.isOmittedExpression(element)) {
        continue;
      }

      const part = extractBindingNames(element.name, context);
      for (const [name, identifiers] of part.declared) {
        if (!declared_.has(name)) {
          declared_.set(name, []);
        }
        declared_.get(name)!.push(identifiers);
      }
      free_.push(part.free);

      if (element.initializer !== undefined) {
        free_.push(extractFreeVariables(element.initializer, context));
      }

      if (element.propertyName) {
        if (ts.isComputedPropertyName(element.propertyName)) {
          free_.push(
            extractFreeVariables(element.propertyName.expression, context),
          );
        } else {
          free_.push(extractFreeVariables(element.propertyName, context));
        }
      }
    }
  }

  // identifier
  if (ts.isIdentifier(bindingName)) {
    // declared.add(bindingName.text);
    // declared_.push(new Map([[bindingName.text, new Set([bindingName])]]));
    if (!declared_.has(bindingName.text)) {
      declared_.set(bindingName.text, []);
    }
    declared_.get(bindingName.text)!.push(new Set([bindingName]));
  }

  const free = joinFree(free_);
  const declared = joinDeclaredWithoutType(declared_);

  // delete all declared variables from free
  for (const name of declared.keys()) {
    if (!free.has(name)) {
      continue;
    }
    for (const st of free.get(name)!) {
      declared.get(name)!.add(st);
    }
    free.delete(name);
  }

  return {
    declared,
    free,
  };
};

const extractFunctionLike = (
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  body: ts.ConciseBody | undefined,
  context: ts.TransformationContext,
): Map<string, Set<ts.Identifier>> => {
  if (body === undefined) {
    return new Map();
  }
  // bodyStat.declared doesn't matter becase they won't negate any other free variables

  const bodyStat = extractVariableStatistics(body, context);
  const free_ = [
    bodyStat.free,
    ...parameters.flatMap((parameter) =>
      parameter.initializer !== undefined
        ? extractFreeVariables(parameter.initializer, context)
        : [],
    ),
  ];

  // const declared_ = new Set<string>();
  const declared_: Map<string, Set<ts.Identifier>[]> = new Map();

  for (const parameter of parameters) {
    const bindings = extractBindingNames(parameter.name, context);

    free_.push(bindings.free);
    // declared_.push(bindings.declared);
    for (const [name, identifiers] of bindings.declared) {
      if (!declared_.has(name)) {
        declared_.set(name, []);
      }
      declared_.get(name)!.push(identifiers);
    }
  }

  const free = joinFree(free_);
  // const declared = joinFree(declared_);
  const declared = joinDeclaredWithoutType(declared_);

  for (const name of declared.keys()) {
    if (!free.has(name)) {
      continue;
    }
    for (const st of free.get(name)!) {
      declared.get(name)!.add(st);
    }
    free.delete(name);
  }

  return free;
};

const extractClassLike = (
  members: ts.NodeArray<ts.ClassElement>,
  heritageClauses: ts.NodeArray<ts.HeritageClause> | undefined,
  context: ts.TransformationContext,
): Map<string, Set<ts.Identifier>> => {
  const free_: Map<string, Set<ts.Identifier>>[] = [];

  if (heritageClauses) {
    for (const clause of heritageClauses) {
      for (const type of clause.types) {
        free_.push(extractFreeVariables(type.expression, context));
      }
    }
  }

  return joinFree([
    ...free_,
    ...members.flatMap((node) => {
      if (ts.isConstructorDeclaration(node)) {
        return extractFunctionLike(node.parameters, node.body, context);
      }

      if (ts.isMethodDeclaration(node)) {
        if (node.body === undefined) {
          return new Map();
        }

        return joinFree([
          ts.isComputedPropertyName(node.name)
            ? extractFreeVariables(node.name.expression, context)
            : new Map(),

          extractFunctionLike(node.parameters, node.body, context),
        ]);
      }

      if (ts.isPropertyDeclaration(node)) {
        return node.initializer !== undefined
          ? extractFreeVariables(node.initializer, context)
          : new Map();
      }

      if (ts.isClassStaticBlockDeclaration(node)) {
        return extractVariableStatistics(node.body, context).free;
      }

      if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
        return joinFree([
          ts.isComputedPropertyName(node.name)
            ? extractFreeVariables(node.name.expression, context)
            : new Map(),
          extractFunctionLike(node.parameters, node.body, context),
        ]);
      }

      throw new ASTSurprise({
        message: `unhandled class property: ${getSyntaxKindName(node.kind)}`,
        node,
      });
    }),
  ]);
};

const extractFreeVariables = (
  node: ts.Expression,
  context: ts.TransformationContext,
): Map<string, Set<ts.Identifier>> => {
  if (
    ts.isNumericLiteral(node) ||
    ts.isStringLiteral(node) ||
    ts.isRegularExpressionLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isLiteralExpression(node) ||
    ts.isOmittedExpression(node) ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.UndefinedKeyword ||
    node.kind === ts.SyntaxKind.VoidKeyword
  ) {
    return new Map();
  }

  if (ts.isFunctionExpression(node)) {
    const free = extractFunctionLike(node.parameters, node.body, context);
    if (node.name !== undefined) {
      // delete function name from free variables
      free.delete(node.name.text);
    }

    return free;
  }

  if (ts.isCallExpression(node)) {
    // compute for expression and arguments and merge
    return joinFree(
      [node.expression, ...node.arguments].map((node) =>
        extractFreeVariables(node, context),
      ),
    );
  }

  if (ts.isPropertyAccessExpression(node)) {
    return extractFreeVariables(node.expression, context);
  }

  if (ts.isIdentifier(node)) {
    return new Map([[node.text, new Set([node])]]);
  }

  if (
    node.kind === ts.SyntaxKind.ThisKeyword ||
    // @ts-expect-error
    node.kind === ts.SyntaxKind.NullKeyword ||
    // @ts-expect-error
    node.kind === ts.SyntaxKind.TrueKeyword ||
    // @ts-expect-error
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.SuperKeyword ||
    node.kind === ts.SyntaxKind.ImportKeyword
  ) {
    return new Map();
  }

  if (ts.isArrowFunction(node)) {
    return extractFunctionLike(node.parameters, node.body, context);
  }

  if (ts.isArrayLiteralExpression(node)) {
    return joinFree(
      node.elements.map((node) => extractFreeVariables(node, context)),
    );
  }

  if (ts.isObjectLiteralExpression(node)) {
    return joinFree(
      node.properties.flatMap((node) => {
        if (ts.isPropertyAssignment(node)) {
          return joinFree([
            ts.isComputedPropertyName(node.name)
              ? extractFreeVariables(node.name.expression, context)
              : new Map(),
            extractFreeVariables(node.initializer, context),
          ]);
        }

        if (ts.isSpreadAssignment(node)) {
          return extractFreeVariables(node.expression, context);
        }

        if (ts.isMethodDeclaration(node)) {
          return joinFree([
            ts.isComputedPropertyName(node.name)
              ? extractFreeVariables(node.name.expression, context)
              : new Map(),
            extractFunctionLike(node.parameters, node.body, context),
          ]);
        }

        if (ts.isShorthandPropertyAssignment(node)) {
          return new Map([[node.name.text, new Set([node.name])]]);
        }

        if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
          return joinFree([
            ts.isComputedPropertyName(node.name)
              ? extractFreeVariables(node.name.expression, context)
              : new Map(),
            extractFunctionLike(node.parameters, node.body, context),
          ]);
        }

        // Exhaustiveness check - node should be 'never' here
        // but we keep this for safety against future TypeScript changes
        const _exhaustiveCheck: never = node;
        throw new ASTSurprise({
          message: `unhandled property: ${getSyntaxKindName(
            (_exhaustiveCheck as ts.Node).kind,
          )}`,
          node: _exhaustiveCheck,
        });
      }),
    );
  }

  if (ts.isParenthesizedExpression(node)) {
    return extractFreeVariables(node.expression, context);
  }

  if (ts.isBinaryExpression(node)) {
    return joinFree([
      extractFreeVariables(node.left, context),
      extractFreeVariables(node.right, context),
    ]);
  }

  if (ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) {
    return extractFreeVariables(node.operand, context);
  }

  if (ts.isClassExpression(node)) {
    const free = extractClassLike(node.members, node.heritageClauses, context);

    if (node.name !== undefined) {
      free.delete(node.name.text);
    }
    return free;
  }

  if (ts.isElementAccessExpression(node)) {
    return joinFree([
      extractFreeVariables(node.expression, context),
      extractFreeVariables(node.argumentExpression, context),
    ]);
  }

  if (ts.isConditionalExpression(node)) {
    return joinFree([
      extractFreeVariables(node.condition, context),
      extractFreeVariables(node.whenTrue, context),
      extractFreeVariables(node.whenFalse, context),
    ]);
  }

  if (ts.isNewExpression(node)) {
    const result = [extractFreeVariables(node.expression, context)];
    if (node.arguments !== undefined) {
      for (const argument of node.arguments) {
        result.push(extractFreeVariables(argument, context));
      }
    }
    return joinFree(result);
  }

  if (
    ts.isVoidExpression(node) ||
    ts.isDeleteExpression(node) ||
    ts.isTypeOfExpression(node)
  ) {
    return extractFreeVariables(node.expression, context);
  }

  if (ts.isMetaProperty(node)) {
    // NOTE: might need to handle differently later
    return new Map();
  }

  if (ts.isSpreadElement(node)) {
    return extractFreeVariables(node.expression, context);
  }

  if (ts.isTemplateExpression(node)) {
    return joinFree(
      node.templateSpans.map((span) =>
        extractFreeVariables(span.expression, context),
      ),
    );
  }

  if (ts.isAwaitExpression(node)) {
    return extractFreeVariables(node.expression, context);
  }

  if (ts.isYieldExpression(node)) {
    if (node.expression) {
      return extractFreeVariables(node.expression, context);
    }
    return new Map();
  }

  if (ts.isTaggedTemplateExpression(node)) {
    return joinFree([
      extractFreeVariables(node.tag, context),
      extractFreeVariables(node.template, context),
    ]);
  }

  if (ts.isPartiallyEmittedExpression(node)) {
    return extractFreeVariables(node.expression, context);
  }

  throw new ASTSurprise({
    message: `unhandled expression: ${getSyntaxKindName(node.kind)}`,
    node,
  });
};

export const extractVariableStatistics = wrap(
  (
    node: ts.Node,
    context: ts.TransformationContext,
  ): {
    declared: Map<
      string,
      { type: "function" | "block"; nodes: Set<ts.Identifier> }
    >;
    free: Map<string, Set<ts.Identifier>>;
  } => {
    // return all the variables used in this node that are not in scope
    const declared_: Map<
      string,
      { type: "function" | "block"; nodes: Set<ts.Identifier>[] }
    > = new Map();
    const free_: Map<string, Set<ts.Identifier>>[] = [];

    if (ts.isEmptyStatement(node)) {
      return {
        declared: joinDeclared(declared_),
        free: joinFree(free_),
      };
    }

    if (ts.isVariableStatement(node)) {
      return extractVariableStatistics(node.declarationList, context);
    }

    if (ts.isVariableDeclarationList(node)) {
      for (const declaration of node.declarations) {
        // for `let` and `const`, scope is the block
        // for `var`, scope is the function
        const scope =
          node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)
            ? "block"
            : "function";

        const bindings = extractBindingNames(declaration.name, context);

        free_.push(bindings.free);
        for (const [name, identifiers] of bindings.declared) {
          if (!declared_.has(name)) {
            declared_.set(name, { type: scope, nodes: [] });
          }
          declared_.get(name)!.nodes.push(identifiers);
        }

        if (declaration.initializer !== undefined) {
          free_.push(extractFreeVariables(declaration.initializer, context));
        }

        for (const name of bindings.declared.keys()) {
          for (const free of free_) {
            if (!declared_.has(name)) {
              throw new Error("should not happen");
            }
            if (!free.has(name)) {
              continue;
            }
            declared_.get(name)!.nodes.push(free.get(name)!);
            free.delete(name);
          }
        }
      }

      return {
        declared: joinDeclared(declared_),
        free: joinFree(free_),
      };
    }

    if (ts.isBlock(node)) {
      const parts = node.statements.map((statement) =>
        extractVariableStatistics(statement, context),
      );

      const result = combine(parts);

      // remove all block-scoped variables which should not get out of the block
      for (const [name, { type }] of result.declared) {
        if (type === "block") {
          result.declared.delete(name);
        }
      }

      return result;
    }

    if (ts.isExpressionStatement(node)) {
      return extractVariableStatistics(node.expression, context);
    }

    if (ts.isExpression(node)) {
      return {
        declared: joinDeclared(declared_),
        free: extractFreeVariables(node, context),
      };
    }

    if (ts.isReturnStatement(node)) {
      if (!node.expression) {
        return {
          declared: joinDeclared(declared_),
          free: new Map(),
        };
      }
      return extractVariableStatistics(node.expression, context);
    }

    if (ts.isForStatement(node)) {
      const parts = [extractVariableStatistics(node.statement, context)];

      if (node.initializer) {
        parts.push(extractVariableStatistics(node.initializer, context));
      }

      if (node.condition) {
        parts.push(extractVariableStatistics(node.condition, context));
      }

      if (node.incrementor) {
        parts.push(extractVariableStatistics(node.incrementor, context));
      }

      const result = combine(parts);

      for (const [name, { type }] of result.declared) {
        if (type === "block") {
          result.declared.delete(name);
        }
      }

      return result;
    }

    if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      const parts = [
        extractVariableStatistics(node.statement, context),
        extractVariableStatistics(node.expression, context),
        extractVariableStatistics(node.initializer, context),
      ];

      const result = combine(parts);

      for (const [name, { type }] of result.declared) {
        if (type === "block") {
          result.declared.delete(name);
        }
      }

      return result;
    }

    if (ts.isIfStatement(node)) {
      const parts = [extractVariableStatistics(node.expression, context)];

      parts.push(extractVariableStatistics(node.thenStatement, context));

      if (node.elseStatement) {
        parts.push(extractVariableStatistics(node.elseStatement, context));
      }

      return combine(parts);
    }

    if (ts.isWhileStatement(node)) {
      const parts = [
        extractVariableStatistics(node.statement, context),
        extractVariableStatistics(node.expression, context),
      ];

      return combine(parts);
    }

    if (ts.isDoStatement(node)) {
      const parts = [
        extractVariableStatistics(node.statement, context),
        extractVariableStatistics(node.expression, context),
      ];

      return combine(parts);
    }

    if (ts.isFunctionDeclaration(node)) {
      if (node.body === undefined) {
        return {
          declared: joinDeclared(declared_),
          free: new Map(),
        };
      }

      const currentFree = extractFunctionLike(
        node.parameters,
        node.body,
        context,
      );

      const declared =
        node.name !== undefined
          ? new Map([
              [
                node.name.text,
                {
                  type: "block",
                  nodes: new Set([node.name]),
                },
              ],
            ])
          : new Map();

      if (node.name !== undefined) {
        for (const val of currentFree.get(node.name.text) ?? new Set()) {
          declared.get(node.name.text)!.nodes.add(val);
        }
        currentFree.delete(node.name.text);
      }

      return {
        declared,
        free: currentFree,
      };
    }

    if (ts.isThrowStatement(node)) {
      return extractVariableStatistics(node.expression, context);
    }

    if (ts.isCatchClause(node)) {
      const result = extractVariableStatistics(node.block, context);

      if (node.variableDeclaration) {
        const names = extractBindingNames(
          node.variableDeclaration.name,
          context,
        );

        result.free = joinFree([result.free, names.free]);

        for (const name of names.declared.keys()) {
          if (!result.free.has(name)) {
            continue;
          }
          if (!declared_.has(name)) {
            declared_.set(name, {
              type: "block",
              nodes: [],
            });
          }
          declared_.get(name)!.nodes.push(result.free.get(name) ?? new Set());
          result.free.delete(name);
        }

        if (node.variableDeclaration.initializer) {
          result.free = joinFree([
            result.free,
            extractFreeVariables(node.variableDeclaration.initializer, context),
          ]);
        }
      }

      return result;
    }

    if (ts.isTryStatement(node)) {
      const parts = [extractVariableStatistics(node.tryBlock, context)];

      if (node.catchClause) {
        parts.push(extractVariableStatistics(node.catchClause, context));
      }

      if (node.finallyBlock) {
        parts.push(extractVariableStatistics(node.finallyBlock, context));
      }

      return combine(parts);
    }

    if (ts.isLabeledStatement(node)) {
      return extractVariableStatistics(node.statement, context);
    }

    if (ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
      return {
        declared: joinDeclared(declared_),
        free: new Map(),
      };
    }

    if (ts.isClassDeclaration(node)) {
      return {
        declared:
          node.name !== undefined
            ? new Map([
                [
                  node.name.text,
                  {
                    type: "block",
                    nodes: new Set([node.name]),
                  },
                ],
              ])
            : new Map(),
        free: extractClassLike(node.members, node.heritageClauses, context),
      };
    }

    if (ts.isSwitchStatement(node)) {
      const parts = [extractVariableStatistics(node.expression, context)];

      for (const clause of node.caseBlock.clauses) {
        parts.push(extractVariableStatistics(clause, context));
      }

      const result = combine(parts);
      for (const [name, { type }] of result.declared) {
        if (type === "block") {
          result.declared.delete(name);
        }
      }
      return result;
    }

    if (ts.isCaseClause(node)) {
      const parts = [extractVariableStatistics(node.expression, context)];

      for (const statement of node.statements) {
        parts.push(extractVariableStatistics(statement, context));
      }

      return combine(parts);
    }

    if (ts.isDefaultClause(node)) {
      const parts = [
        ...node.statements.map((statement) =>
          extractVariableStatistics(statement, context),
        ),
      ];

      return combine(parts);
    }

    if (ts.isNotEmittedStatement(node)) {
      return {
        declared: new Map(),
        free: new Map(),
      };
    }

    if (ts.isExportAssignment(node)) {
      return extractVariableStatistics(node.expression, context);
    }

    if (ts.isDebuggerStatement(node)) {
      return {
        declared: new Map(),
        free: new Map(),
      };
    }

    throw new ASTSurprise({
      message: `unhandled node: ${getSyntaxKindName(node.kind)}`,
      node,
    });
  },
);
