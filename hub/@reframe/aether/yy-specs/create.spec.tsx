/**
 * given a workingTree, traverse app/ and find all matching files
 * examples, of files that should match,
 * /@
 * └── /app
 *    ├── /middleware.ts
 *    ├── /page.tsx
 *    ├── /layout.tsx
 *    ├── /serve.ts
 *    ├── /home
 *    ├   ├── /middleware.ts
 *    ├   └── /page.tsx
 *    ├── /auth
 *    ├   ├── /middleware.ts
 *    ├   └── /page.tsx
 *    ├───/:alice
 *    ├   ├── /middleware.ts
 *    ├   └── /page.tsx
 *    ├───/:bob
 *    ├   ├── /middleware.ts
 *    ├   └── /page.tsx
 *    └───/::path
 *        ├── /middleware.ts
 *        └── /page.tsx
 *
 * first write a function, that takes a workingTree
 * and returns a list of all matching paths
 *
 * function list(_: WorkingTree): Promise<t.Path[]>
 *
 * list(w) = [
 *   /middleware.ts,
 *   /page.tsx,
 *   /layout.tsx,
 *   /serve.ts,
 *   /home/middleware.ts
 *   /home/page.tsx
 *   ...
 * ]
 *
 * then, another function will take that list, and creates
 * a nested structure
 *
 * type Routes = {
 *   page?: string; // page.tsx
 *   layout?: string | null;
 *   middleware?: string;
 *   serve?: string;
 *   routes: Record<string, Routes>
 * }
 *
 * function traverse(_: t.Path[]): Routes
 *
 * second(_) = {
 *   page: 'page.tsx',
 *   layout: 'layout.tsx',
 *   ...
 *   routes: {
 *     home: {
 *       page: 'page.tsx',
 *       middleware: 'middleware.ts',
 *     },
 *     auth: {...},
 *     :alice: {...}
 *   }
 * }
 *
 * function create(_: Routes): App
 *
 * /
 * Router => (
 *   <Router.Route
 *     page={lazy(() => import("/@/app/page.tsx", {})}
 *     layout={lazy(() => import("/@/app/layout.tsx", {})}
 *     middleware={lazy(() => import("/@/app/middleware.ts", {})}
 *
 *     route:home={...}
 *     route:auth={...}
 *
 *     route={alice => Router => (
 *       <Router.Route
 *         page={lazy(() => import("/@/app/:alice/page.tsx"), { alice })}
 *         route:profile={...}
 *         route:settings={...}
 *         route={(...path) => Router => (
 *           <Router.Route
 *             page={lazy(() => import("/@/app/:alice/::path/page.tsx"), { alice, path })}
 *           />
 *         )}
 *       />
 *     )}
 *   />
 * )
 *
 * import {ts} from 06-compiler/ts/analyze.ts
 * const printer = ts.printAppTsx(...)
 *
 *
 * const createRoute = (route: Routes, path: string): string => {
    const { page, layout, middleware, serve, routes: nestedRoutes } = route;

    const routeProps = [
      page ? `page={lazy(() => import("${path}/${page}"))}` : "",
      layout ? `layout={lazy(() => import("${path}/${layout}"))}` : "",
      middleware
        ? `middleware={lazy(() => import("${path}/${middleware}"))}`
        : "",
      serve ? `serve={lazy(() => import("${path}/${serve}"))}` : "",
    ].filter(Boolean).join(", ");

    const nestedRouteComponents = Object.entries(nestedRoutes).map(
      ([name, nestedRoute]) => {
        // Handle dynamic segments
        const dynamicSegment = name.startsWith(":")
          ? `:${name.slice(1)}`
          : name;
        const isDynamic = name.startsWith(":");

        const dynamicPath = isDynamic ? `...path` : undefined;

        const nestedRoutePath = isDynamic
          ? `${path}/${dynamicSegment}`
          : `${path}/${name}`;
        const nestedRouteProps = createRoute(nestedRoute, nestedRoutePath);
        const nestedRouteComponent = isDynamic
          ? `<Router.Route ${nestedRouteProps} path="${nestedRoutePath}" {...${dynamicPath}} />`
          : `<Router.Route ${nestedRouteProps} path="${nestedRoutePath}" />`;
        return nestedRouteComponent;
      },
    ).join(", ");
    return `<Router.Route ${routeProps} ${nestedRouteComponents} />`;
  };

  return `<Router>${createRoute(routes, "/@/app")}</Router>`;
 */

import * as t from "../10-server/t.ts";
import { yan } from "../05-yan/yan.mock.ts";
import { listPaths, printAppTsx } from "./create.tsx";
import { traverse } from "./create.tsx";
import { format } from "npm:prettier";

const unindent = (source: string) => {
  const lines = source.split("\n");
  // expect first line to be empty
  while (lines[0]?.trim() === "") {
    lines.shift();
  }

  const indent = lines[0]?.match(/^\s*/)?.[0] ?? "";

  const out = lines
    .map((line) =>
      line
        .replace(indent, "")
        .replace(/^\s*$/, "")
    );

  while (out[out.length - 1]?.trim() === "") {
    out.pop();
  }

  return out;
};

const fmt = async (code: string) => {
  return unindent(
    await format(code, {
      parser: "typescript",
      semi: false,
      singleQuote: true,
    }),
  );
};

const testList = (name: string, ctx: Deno.TestContext, {
  yan,
  with: with_,
  expect,
}: {
  yan: t.yan.Yan;
  with: t.Path[];
  expect: t.Path[];
}) => {
  return ctx.step(name, async () => {
    const commit = await yan.write(
      null,
      Object.fromEntries(
        with_.map((path) => [path, new t.Blob("test")]),
      ),
    );

    const head = await yan.tree(commit);
    const root = yan.workingTree(head);
    const result = await listPaths(root);
    t.test.equals(result.sort(), expect.sort());
  });
};

export const test = (yan: t.yan.Yan) => async (ctx: Deno.TestContext) => {
  await testList("non-matching files", ctx, {
    yan,
    with: [
      "/@/readme.md",
    ],
    expect: [],
  });

  await testList("ignore non-matching files", ctx, {
    yan,
    with: [
      "/@/app/page.d.tsx",
      "/@/app/middleware.js",
      "/@/app/home/readme.md",
    ],
    expect: [],
  });

  await testList("invalid paths among matching files", ctx, {
    yan,
    with: [
      "/@/app/page.tsx",
      "/@/app/middleware.ts",
      "/@/app/home/page.tsx",
      "/@/app/home/middleware.ts",
      "/@/app/:alice/page.tsx",
      "/@/app/:alice/middleware.ts",
      "/@/app/:bob/page.tsx",
      "/@/app/:bob/middleware.ts",
      "/@/app/::path/page.tsx",
      "/@/app/::path/middleware.ts",
      "/@/app/:path/pagefoo.tsx",
      "/@/app/::/middleware.ts",
      "/@/app/:alice/middleware.ts",
      "/@/app/:bob/abcd.tsx",
    ],
    expect: [
      "/page.tsx",
      "/middleware.ts",
      "/home/page.tsx",
      "/home/middleware.ts",
      "/:alice/page.tsx",
      "/:alice/middleware.ts",
      "/:bob/page.tsx",
      "/:bob/middleware.ts",
      "/::path/page.tsx",
      "/::path/middleware.ts",
    ],
  });

  await testList("nested deeper folder", ctx, {
    yan,
    with: [
      "/@/app/home/profile/page.tsx",
      "/@/app/home/profile/middleware.ts",
    ],
    expect: [
      "/home/profile/page.tsx",
      "/home/profile/middleware.ts",
    ],
  });

  await testList("nested layout and serve", ctx, {
    yan,
    with: [
      "/@/app/layout.tsx",
      "/@/app/home/layout.tsx",
      "/@/app/serve.ts",
      "/@/app/home/serve.ts",
    ],
    expect: [
      "/layout.tsx",
      "/serve.ts",
      "/home/layout.tsx",
      "/home/serve.ts",
    ],
  });

  await testList("", ctx, {
    yan,
    with: [
      "/@/app/page.tsx",
      "/@/app/layout.tsx",
      "/@/app/middleware.ts",
      "/@/app/serve.ts",
      "/@/app/home/page.tsx",
      "/@/app/home/middleware.ts",
      "/@/app/auth/page.tsx",
      "/@/app/auth/middleware.ts",
      "/@/app/:alice/page.tsx",
      "/@/app/:alice/middleware.ts",
      "/@/app/:bob/page.tsx",
      "/@/app/:bob/middleware.ts",
      "/@/app/:path/page.tsx",
      "/@/app/:path/middleware.ts",
      "/@/app/auth.ts",
    ],
    expect: [
      "/page.tsx",
      "/layout.tsx",
      "/middleware.ts",
      "/serve.ts",
      "/home/page.tsx",
      "/home/middleware.ts",
      "/auth/page.tsx",
      "/auth/middleware.ts",
      "/:alice/page.tsx",
      "/:alice/middleware.ts",
      "/:bob/page.tsx",
      "/:bob/middleware.ts",
      "/:path/page.tsx",
      "/:path/middleware.ts",
    ],
  });
};

export const testTraverse = () => async (ctx: Deno.TestContext) => {
  await ctx.step("no paths", () => {
    const result = traverse([]);
    t.test.equals(result, { routes: {} });
  });

  await ctx.step("single route", () => {
    const input = ["home/page.tsx"];
    const expected = {
      routes: {
        home: {
          page: "page.tsx",
          routes: {},
        },
      },
    };
    const result = traverse([`/${input}`]);
    t.test.equals(result, expected);
  });

  await ctx.step("full home handlers", () => {
    const result = traverse([
      "/page.tsx",
      "/layout.tsx",
      "/middleware.ts",
      "/serve.ts",
      "/home/page.tsx",
      "/home/layout.tsx",
      "/home/middleware.ts",
      "/:alice/page.tsx",
      "/:alice/layout.tsx",
      "/:bob/::path/page.tsx",
      "/:bob/::path/layout.tsx",
    ]);

    t.test.equals(result, {
      page: "page.tsx",
      layout: "layout.tsx",
      middleware: "middleware.ts",
      serve: "serve.ts",
      routes: {
        home: {
          page: "page.tsx",
          layout: "layout.tsx",
          middleware: "middleware.ts",
          routes: {},
        },
        ":alice": {
          page: "page.tsx",
          layout: "layout.tsx",
          routes: {},
        },
        ":bob": {
          routes: {
            "::path": {
              page: "page.tsx",
              layout: "layout.tsx",
              routes: {},
            },
          },
        },
      },
    });
  });
};

export const testPrint = () => async (ctx: Deno.TestContext) => {
  await ctx.step("print nested routes", async () => {
    const input = {
      page: "page.tsx",
      layout: "layout.tsx",
      middleware: "middleware.ts",
      serve: "serve.ts",
      routes: {
        home: {
          page: "page.tsx",
          layout: "layout.tsx",
          middleware: "middleware.ts",
          routes: {},
        },
        ":alice": {
          page: "page.tsx",
          layout: "layout.tsx",
          routes: {},
        },
        ":bob": {
          routes: {
            "::path": {
              page: "page.tsx",
              layout: "layout.tsx",
              routes: {},
            },
          },
        },
      },
    };

    const expected = `
      import { createApp, lazy } from "@reframe/router/index.tsx";
      export default createApp(Router => (
        <Router.Route
          middleware={lazy.middleware(() => import("/@/app/middleware.ts"), {})}
          page={lazy.page(() => import("/@/app/page.tsx"), {})}
          layout={lazy.layout(() => import("/@/app/layout.tsx"), {})}
          serve={lazy.serve(() => import("/@/app/serve.ts"), {})}
          route:home={Router => (
            <Router.Route
              middleware={lazy.middleware(() => import("/@/app/home/middleware.ts"), {})}
              page={lazy.page(() => import("/@/app/home/page.tsx"), {})}
              layout={lazy.layout(() => import("/@/app/home/layout.tsx"), {})}
            />
          )}
          route={alice => Router => (
            <Router.Route
              page={lazy.page(() => import("/@/app/:alice/page.tsx"), { alice })}
              layout={lazy.layout(() => import("/@/app/:alice/layout.tsx"), { alice })}
            />
          )}

           route={bob => Router => (
            <Router.Route
              route={(...path) => Router => (
                <Router.Route
                  page={lazy.page(() => import("/@/app/:bob/::path/page.tsx"), { bob, path })}
                  layout={lazy.layout(() => import("/@/app/:bob/::path/layout.tsx"), { bob, path })}
                />
              )}
            />
          )}
        />
      ))
    `;

    const result = printAppTsx(input);
    t.test.equals(
      await fmt(result),
      await fmt(expected),
    );
  });

  await ctx.step("print empty routes", async () => {
    const input = {
      routes: {},
    };

    const expected = `
      import { createApp, lazy } from "@reframe/router/index.tsx";
      export default createApp(Router => (
        <Router.Route />
      ))
    `;

    const result = printAppTsx(input);
    t.test.equals(
      await fmt(result),
      await fmt(expected),
    );
  });

  await ctx.step("print only page", async () => {
    const input = { page: "page.tsx", routes: {} };
    const expected = `
      import { createApp, lazy } from "@reframe/router/index.tsx";
      export default createApp(Router => (
        <Router.Route
          page={lazy.page(() => import("/@/app/page.tsx"), {})}
        />
      ))
    `;
    const result = printAppTsx(input);
    t.test.equals(
      await fmt(result),
      await fmt(expected),
    );
  });

  await ctx.step("error on only '::' segment", async () => {
    const input = {
      routes: {
        ":": { routes: {} },
      },
    };

    t.test.throws(
      () => printAppTsx(input),
      Error,
      "Invalid route parameter: :. Route parameters cannot start and end with a colon.",
    );
  });

  await ctx.step("error on nested only ':' under dynamic route", async () => {
    const input = {
      page: "page.tsx",
      layout: "layout.tsx",
      serve: "serve.ts",
      routes: {
        ":alice": {
          page: "page.tsx",
          routes: {
            ":": { routes: {} },
          },
        },
      },
    };

    t.test.throws(
      () => printAppTsx(input),
      Error,
      "Invalid route parameter: :. Route parameters cannot start and end with a colon.",
    );
  });
};

Deno.test("create", async (ctx) => {
  await test(yan())(ctx);
});

Deno.test("traverse", async (ctx) => {
  await testTraverse()(ctx);
});

Deno.test("print", async (ctx) => {
  await testPrint()(ctx);
});
