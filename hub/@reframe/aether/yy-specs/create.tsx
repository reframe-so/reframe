import { ts } from "../06-compiler/ts/system.ts";
import * as t from "../10-server/t.ts";

type Tree = Record<string, Node>;

type Node =
  | (t.yan.WorkingTree & {
    kind: "tree";
    hash: t.Hash<Tree>;
  })
  | (t.yan.WorkingTree & {
    kind: "blob";
    hash: t.Hash<unknown>;
  });

type Routes = {
  page?: string; // page.tsx
  layout?: string | null;
  middleware?: string;
  serve?: string;
  routes: Record<string, Routes>;
};

export const listPaths = async (tree: t.yan.WorkingTree): Promise<t.Path[]> => {
  const paths: t.Path[] = [];
  const patterns = [
    "middleware.ts",
    "page.tsx",
    "layout.tsx",
    "serve.ts",
  ];

  const queue: t.Path[] = ["/"];

  while (queue.length > 0) {
    const currentPath = queue.pop()!;

    try {
      const list = await tree.list(`/@/app${currentPath}`);

      for (const [name, node] of Object.entries(list)) {
        const newPath = t.joinPath(currentPath, name);

        if (node.kind === "tree") {
          if (name.startsWith(":") && name.endsWith(":")) {
            continue;
          }
          queue.push(newPath);
        } else if (node.kind === "blob" && patterns.includes(name)) {
          paths.push(newPath);
        }
      }
    } catch (e) {
      if (e instanceof t.yan.NotFoundSurprise) {
        continue;
      }

      throw e;
    }
  }

  return paths;
};

export const traverse = (paths: t.Path[]): Routes => {
  const routes: Routes = { routes: {} };

  for (const fullPath of paths) {
    const parts = t.splitPath(fullPath);
    let current = routes;

    // pop off the file name
    const fileName = parts.pop()!;

    // drill into (or create) nested route objects
    for (const segment of parts) {
      if (!current.routes[segment]) {
        current.routes[segment] = { routes: {} };
      }

      current = current.routes[segment];
    }

    switch (fileName) {
      case "page.tsx":
        current.page = fileName;
        break;
      case "layout.tsx":
        current.layout = fileName;
        break;
      case "middleware.ts":
        current.middleware = fileName;
        break;
      case "serve.ts":
        current.serve = fileName;
        break;
      default:
        break;
    }
  }

  return routes;
};

const createSegment = (
  key: string,
  path: t.Path,
  name: string,
  param: string[],
) => {
  return ts.factory.createJsxAttribute(
    ts.factory.createIdentifier(key),
    ts.factory.createJsxExpression(
      undefined,
      ts.factory.createCallExpression(
        /* lazy */ ts.factory.createIdentifier(`lazy.${key}`),
        /* typeArgs */ undefined,
        [
          ts.factory.createArrowFunction(
            /* modifiers */ undefined,
            /* typeParams */ undefined,
            /* params */ [],
            /* returnType */ undefined,
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            ts.factory.createCallExpression(
              /* import */ ts.factory.createIdentifier("import"),
              /* typeArgs */ undefined,
              [ts.factory.createStringLiteral(`${path}/${name}`)],
            ),
          ),
          ts.factory.createObjectLiteralExpression(
            // if param is [foo, bar] => { foo, bar }
            param.map((p) => {
              return ts.factory.createShorthandPropertyAssignment(
                ts.factory.createIdentifier(p),
              );
            }),
            /* multiline */ false,
          ),
        ],
      ),
    ),
  );
};

const createRouter = (routes: Routes, path: t.Path, param: string[]) => {
  const attributes: ts.JsxAttributeLike[] = [];

  if (routes.middleware) {
    attributes.push(
      createSegment("middleware", path, routes.middleware, param),
    );
  }

  if (routes.page) {
    attributes.push(
      createSegment("page", path, routes.page, param),
    );
  }

  if (routes.layout) {
    attributes.push(
      createSegment("layout", path, routes.layout, param),
    );
  }

  if (routes.serve) {
    attributes.push(
      createSegment("serve", path, routes.serve, param),
    );
  }

  if (routes.routes) {
    // console.log("routes.routes", routes.routes);
    for (const [key, value] of Object.entries(routes.routes)) {
      if (!key.startsWith(":")) {
        attributes.push(
          ts.factory.createJsxAttribute(
            ts.factory.createIdentifier(`route:${key}`),
            ts.factory.createJsxExpression(
              undefined,
              createRouter(value, `${path}/${key}`, param),
            ),
          ),
        );
        continue;
      }

      if (key.startsWith(":") && key.endsWith(":")) {
        throw new Error(
          `Invalid route parameter: ${key}. Route parameters cannot start and end with a colon.`,
        );
      }

      const name = key.slice(1);

      attributes.push(
        ts.factory.createJsxAttribute(
          ts.factory.createIdentifier(`route`),
          ts.factory.createJsxExpression(
            undefined,
            ts.factory.createArrowFunction(
              undefined,
              undefined,
              [
                ts.factory.createParameterDeclaration(
                  undefined,
                  !name.startsWith(":")
                    ? undefined
                    : ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
                  ts.factory.createIdentifier(
                    name.startsWith(":") ? name.slice(1) : name,
                  ),
                  undefined,
                  undefined,
                ),
              ],
              undefined,
              ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              createRouter(value, `${path}/${key}`, [
                ...param,
                name.startsWith(":") ? name.slice(1) : name,
              ]),
            ),
          ),
        ),
      );
    }
  }

  return ts.factory.createArrowFunction(
    undefined,
    undefined,
    [
      ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        ts.factory.createIdentifier("Router"),
        undefined,
        undefined,
      ),
    ],
    undefined,
    ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    ts.factory.createJsxSelfClosingElement(
      ts.factory.createIdentifier("Router.Route"),
      undefined,
      ts.factory.createJsxAttributes(
        attributes,
      ),
    ),
  );
};

// import { createApp, lazy } from "@reframe/router/index.tsx";
const importDeclaration = ts.factory.createImportDeclaration(
  undefined,
  ts.factory.createImportClause(
    /* isTypeOnly */ false,
    /* name       */ undefined,
    ts.factory.createNamedImports([
      ts.factory.createImportSpecifier(
        false,
        undefined,
        ts.factory.createIdentifier("createApp"),
      ),
      ts.factory.createImportSpecifier(
        false,
        undefined,
        ts.factory.createIdentifier("lazy"),
      ),
    ]),
  ),
  ts.factory.createStringLiteral("@bootstrap/router/index.tsx"),
);

export const printAppTsx = (routes: Routes): string => {
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
  });

  const exportDeclaration = ts.factory.createExportAssignment(
    undefined,
    false,
    ts.factory.createCallExpression(
      ts.factory.createIdentifier("createApp"),
      undefined,
      [
        createRouter(routes, "/@/app", []),
      ],
    ),
  );

  const printedCode = printer.printFile(
    ts.factory.createSourceFile(
      [importDeclaration, exportDeclaration],
      ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None,
    ),
  );

  return printedCode;
};

export const createApp = async (
  tree: t.yan.WorkingTree,
): Promise<string> => {
  const paths = await listPaths(tree);
  const routes = traverse(paths);
  const code = printAppTsx(routes);

  // console.log("=========== [paths] ===========");
  // console.log(paths);
  // console.log("=========== [routes] ===========");
  // console.log(routes);
  // console.log("=========== [code] ===========");
  // console.log(code);

  return code;
};
