import React from "npm:react";
import { createContext } from "./server-context.tsx";
import { defaultRenderer, renderRsc, reply } from "@bootstrap/render/web.tsx";
import { Async } from "@bootstrap/render/boundaries.tsx";
import { Outlet, Render, useRouter } from "./outlet.tsx";

type Thenable<T> = Promise<T> | { then: <U>(cb: (value: T) => U) => U };
type MaybePromise<T> = T | Promise<T>;

type Empty = Record<string, unknown>;

type Layers = {
  layout?: React.ReactNode;
  page?: React.ReactNode;
  routes: Record<string, Layers>;
};

type RouteInstance<Prev extends Empty, Ctx extends Empty> = {
  ui: {
    render?: (
      element: React.ReactNode,
      request: Request,
      prev: (element: React.ReactNode, request: Request) => Thenable<Response>,
    ) => Thenable<Response>;
    context?: (prev: Prev) => Thenable<Ctx>;
    page?: () => React.ReactNode;
    layout?: () => React.ReactNode;
  };

  http: {
    request?: (
      request: Request,
      context: () => Thenable<Prev & Ctx>,
    ) => Thenable<Response>;
    // todo: make it (request, ctx: { next, content, path })
    middleware: (
      request: Request,
      next: (request: Request) => Thenable<Response>,
      context: () => Thenable<Prev & Ctx>,
    ) => Thenable<Response>;
  };

  staticRoutes: Record<string, () => RouteInstance<Prev, Ctx>>;
  dynamicRoute?: (
    segment: string,
    ...rest: string[]
  ) => RouteInstance<Prev, Ctx>;
};

export type Middleware<Ctx extends Empty> = (
  request: Request,
  next: (request: Request) => Thenable<Response>,
  context: () => Thenable<Ctx>,
) => MaybePromise<Response>;

export type RouteProps<Prev extends Empty, Ctx extends Empty> =
  & {
    render?: (element: React.ReactNode, request: Request) => Thenable<Response>;
    context?: (prev: Prev) => Thenable<Ctx>;

    layout?: (
      Router: Pick<
        RouterInstance<Prev & Ctx>,
        "Context" | "Outlet" | "path" | "segments"
      >,
    ) => React.ReactElement;
    page?: (
      Router: Pick<
        RouterInstance<Prev & Ctx>,
        "Context" | "path" | "segments" | "query"
      >,
    ) => React.ReactElement;

    route?: (segment: string, ...rest: string[]) => RouteSegment<Prev & Ctx>;
    [route: `route:${string}`]: RouteSegment<Prev & Ctx>;

    middleware?: Middleware<Prev & Ctx> | Middleware<Prev & Ctx>[];
  }
  & Partial<
    Record<
      | "serve"
      | "serve:get"
      | "serve:post"
      | "serve:put"
      | "serve:delete"
      | "serve:patch"
      | "serve:options"
      | "serve:head",
      (
        request: Request,
        context: () => Thenable<Prev & Ctx>,
      ) => MaybePromise<Response>
    >
  >;

function Route<Prev extends Empty, Ctx extends Empty>(
  _: RouteProps<Prev, Ctx>,
): React.ReactElement {
  throw new Error("not implemented");
}

const Context = createContext<unknown>("router");

const thenable = <T,>(value: MaybePromise<T>): Thenable<T> =>
  value instanceof Promise ? value : {
    then: <U,>(onFullfilled: (value: T) => U) => onFullfilled(value),
  };

export const combineMiddlewares = <Ctx extends Empty>(
  middleware: Middleware<Ctx> | Middleware<Ctx>[],
): Middleware<Ctx> => {
  if (Array.isArray(middleware)) {
    return middleware.reduceRight(
      (inner, outer) => (request, next, context) =>
        outer(
          request,
          async (request) => inner(request, next, context),
          context,
        ),
      async (request, next) => next(request),
    );
  }

  return middleware;
};

const createRouteInstance = <Prev extends Empty, Ctx extends Empty>(
  element: React.ReactElement<RouteProps<Prev, Ctx>>,
  base: `/${string}`,
  segments: string[],
  query: Record<string, string>,
): RouteInstance<Prev, Ctx> => {
  if (element.type !== Route) {
    throw new Error(`expected Router.Route, got ${element.type}`);
  }

  const router = createRouter<Prev & Ctx>({ path: base, segments, query });

  const page = element.props.page
    ? () => element.props.page!(router)
    : undefined;

  const layout = element.props.layout
    ? () => element.props.layout!(router)
    : undefined;

  const context = element.props.context;

  const render = element.props.render;
  const middleware = element.props.middleware;

  const staticRoutes: Record<string, () => RouteInstance<Prev, Ctx>> = {};

  for (const path in element.props) {
    if (path.startsWith("route:")) {
      const segment = path.slice("route:".length);
      const route = element.props[path as `route:${string}`];

      staticRoutes[segment] = () =>
        createRouteInstance(
          route?.({ ...router, Self: route }) as React.ReactElement<
            RouteProps<Prev, Ctx>
          >,
          base === "/" ? `/${segment}` : `${base}/${segment}`,
          segments.slice(1),
          query,
        );
    }
  }

  const shouldServe = Object.keys(element.props).some(
    (key) => key === "serve" || key.startsWith("serve:"),
  );

  return {
    // element,
    ui: {
      context,
      layout,
      page,
      render,
    },
    http: {
      request: !shouldServe ? undefined : (request, context) => {
        const method = request.method.toLowerCase() as
          | "get"
          | "post"
          | "put"
          | "delete"
          | "patch"
          | "options"
          | "head";

        const serve = element.props[`serve:${method}`] ?? element.props.serve;

        if (serve) {
          return thenable(serve(request, context));
        }

        throw new Error(
          `${method.toUpperCase()} ${request.url} not implemented`,
        );
      },
      middleware: middleware
        ? async (request, next, context) =>
          combineMiddlewares(middleware)(request, next, context)
        : (request, next) => next(request),
    },
    staticRoutes,
    dynamicRoute: element.props.route
      ? (segment, ...rest) => {
        const route = element.props.route!(segment, ...rest);
        return createRouteInstance(
          route({ ...router, Self: route }) as React.ReactElement<
            RouteProps<Prev, Ctx>
          >,
          base === "/" ? `/${segment}` : `${base}/${segment}`,
          segments.slice(1),
          query,
        );
      }
      : undefined,
  };
};

type RouterContext<T extends Empty> = {
  use: () => Thenable<T>;
  extend: <U extends Empty>(
    _: (prev: T) => Thenable<U>,
  ) => RouterContext<T & U>;
};

const createRouterContext = <Ctx extends Empty>(
  create: () => MaybePromise<Ctx>,
): RouterContext<Ctx> => {
  const value = {
    status: "pending",
  } as
    | {
      status: "pending";
    }
    | {
      status: "fulfilled";
      current: MaybePromise<Ctx>;
    };

  const use = () => {
    if (value.status === "fulfilled") {
      return thenable(value.current);
    }

    const current = create();

    Reflect.set(value, "status", "fulfilled");
    Reflect.set(value, "current", current);

    return thenable(current);
  };

  const extend = <U extends Empty>(extend: (prev: Ctx) => Thenable<U>) =>
    createRouterContext(async () => {
      const prev = await use();
      const current = await extend(prev);
      return { ...prev, ...current };
    });

  return {
    use,
    extend,
  };
};

export const isAPIRequest = (request: Request) =>
  request.headers.get("authorization") !== null ||
  (request.method.toLowerCase() !== "get" &&
    request.method.toLowerCase() !== "head");

function createFetch<Prev extends Empty, Ctx extends Empty>(
  route: RouteInstance<Prev, Ctx>,
) {
  return (
    request: Request,
    ctx: {
      segments: string[];
      rootLayers: Layers;
      branch: Layers;
      path: `/${string}`;
      context: RouterContext<Prev>;
      render: (
        element: React.ReactNode,
        request: Request,
      ) => Thenable<Response>;
    },
  ) => {
    let [segment, ...rest] = ctx.segments;

    const context = route.ui.context
      ? ctx.context.extend(route.ui.context)
      : (ctx.context as RouterContext<Prev & Ctx>);

    return route.http.middleware(
      request,
      (request): Thenable<Response> => {
        if (request.headers.get("x-reframe-server-action")) {
          return reply(request);
        }

        const Provider = ({ children }: { children: React.ReactNode }) => (
          <Async
            value={async () => context.use()}
            use={(value) => (
              <Context.Provider value={value}>{children}</Context.Provider>
            )}
          />
        );

        const render = !route.ui.render
          ? ctx.render
          : (element: React.ReactNode, request: Request) =>
            route.ui.render!(element, request, ctx.render);

        let current = ctx.branch;

        if (segment === ":~") {
          segment = rest[0];

          const next = segment === undefined
            ? undefined
            : segment in route.staticRoutes
            ? route.staticRoutes[segment]()
            : route.dynamicRoute?.(segment, ...rest);

          let initialLayers: Layers = { routes: {} };
          let newBranch: Layers = initialLayers;

          if (segment) {
            newBranch.routes[segment] = { routes: {} };
          }

          if (next) {
            return createFetch(next)(request, {
              segments: rest.slice(1),
              rootLayers: initialLayers,
              branch: newBranch.routes[segment],
              path: ctx.path,
              context,
              render,
            });
          }

          if (segment === undefined && route.ui.page) {
            initialLayers.page = <Provider>{route.ui.page()}</Provider>;
          }

          if (request.headers.get("x-reframe-rsc") === "true") {
            return thenable(renderRsc(initialLayers));
          }

          if (request.headers.get("x-reframe-rsc") === "full") {
            return thenable(
              renderRsc(<Render layers={initialLayers} path={ctx.path} />),
            );
          }

          return render(
            <Render layers={initialLayers} path={ctx.path} />,
            request,
          );
        } else {
          if (segment) {
            current.routes[segment] = { routes: {} };
          }

          if (route.ui.layout) {
            current.layout = <Provider>{route.ui.layout()}</Provider>;
          }
        }

        const next = segment === undefined
          ? undefined
          : segment in route.staticRoutes
          ? route.staticRoutes[segment]()
          : route.dynamicRoute?.(segment, ...rest);

        if (next) {
          return createFetch(next)(request, {
            segments: rest,
            rootLayers: ctx.rootLayers,
            branch: current.routes[segment],
            path: ctx.path,
            context,
            render,
          });
        }

        const shouldServe = segment === undefined &&
          (isAPIRequest(request) ||
            (route.ui.page === undefined && route.http.request !== undefined));

        if (shouldServe) {
          if (route.http.request) {
            return route.http.request(request, context.use);
          }

          if (isAPIRequest(request)) {
            throw new Error(`NOT FOUND: ${request.url}`);
          }
        }

        if (segment === undefined && route.ui.page) {
          current.page = <Provider>{route.ui.page()}</Provider>;
        }

        if (request.headers.get("x-reframe-rsc") === "true") {
          return thenable(renderRsc(ctx.rootLayers));
        }

        return render(
          <Render layers={ctx.rootLayers} path={ctx.path} />,
          request,
        );
      },
      () => context.use(),
    );
  };
}

function createRouter<Ctx extends Empty>({
  path,
  segments,
  query,
}: {
  path: `/${string}`;
  segments: string[];
  query: Record<string, string>;
}) {
  return {
    path,
    Route,
    Outlet,
    Context,
    segments,
    query,
  } as Omit<RouterInstance<Ctx>, "Self">;
}

export function createRoute<
  U extends { request: Request } = { request: Request },
>(
  Route: <Ctx extends U>(
    Router: Pick<RouterInstance<Ctx>, "Route" | "Self">,
  ) => React.ReactElement,
) {
  function createServer() {
    const serve = async (request: Request) => {
      try {
        const segmentPath = (pathname: string) =>
          pathname.split("/").filter(Boolean);

        const url = new URL(request.url);
        const segments = segmentPath(url.pathname);
        const query = Object.fromEntries(url.searchParams.entries());

        const router = createRouteInstance<Empty, { request: Request }>(
          Route({
            ...createRouter<U>({ path: "/", segments, query }),
            Self: Route,
          }) as React.ReactElement<RouteProps<Empty, { request: Request }>>,
          "/",
          segments,
          query,
        );

        const fetch = createFetch(router);

        const initialLayers: Layers = { routes: {} };

        return await fetch(request, {
          segments,
          rootLayers: initialLayers,
          branch: initialLayers,
          path: url.pathname as `/${string}`,
          context: createRouterContext(() => ({ request, serve })),
          render: (element) => defaultRenderer(element),
        });
      } catch (surprise) {
        console.log("[router/surprise]", surprise);
        // return Surprise.from(unknown).toResponse();
        // return defaultRenderer(<Catch surprise={unknown} />, 500);
        return defaultRenderer(
          <pre>{
            surprise instanceof Error ? surprise.stack : String(surprise)
          }</pre>,
        );
      }
    };

    return serve;
  }

  return Object.assign(Route, { createServer });
}

export function createApp(
  Route: <Ctx extends { request: Request }>(
    Router: Pick<RouterInstance<Ctx>, "Route" | "Self">,
  ) => React.ReactElement,
) {
  const app = createRoute(Route);
  const serve = app.createServer();

  return Object.assign(app, { serve });
}

export type RouteSegment<Ctx extends Empty> = (
  Router: Pick<RouterInstance<Ctx>, "Route" | "Self">,
) => React.ReactElement;

export type RouterInstance<Ctx extends Empty> = {
  path: `/${string}`;
  segments: string[];
  query: Record<string, string>;
  Route: <Next extends Empty>(
    props: RouteProps<Ctx, Next>,
  ) => React.ReactElement;
  Outlet: typeof Outlet;
  Context: ReturnType<typeof createContext<Ctx>>;
  Self: RouteSegment<Ctx>;
};

const lazyComponent = (
  fn: () => Promise<
    { default: (props: { params: Record<string, string> }) => React.ReactNode }
  >,
  params: Record<string, string>,
) => {
  const promise = fn();

  return () => (
    <Async
      value={() => promise}
      use={(mod) => {
        const Component = mod.default;
        return <Component params={params} />;
      }}
    />
  );
};

const lazyLayout = (
  fn: () => Promise<
    {
      default: (
        props: { params: Record<string, string>; children: React.ReactNode },
      ) => React.ReactNode;
    }
  >,
  params: Record<string, string>,
) => {
  const promise = fn();

  return (Router: { Outlet: typeof Outlet }) => (
    <Async
      value={() => promise}
      use={(mod) => {
        const Layout = mod.default;
        return (
          <Layout params={params}>
            <Router.Outlet />
          </Layout>
        );
      }}
    />
  );
};

const lazyServe = (
  fn: () => Promise<
    {
      default: (
        request: Request,
        params: Record<string, string>,
      ) => Promise<Response>;
    }
  >,
  params: Record<string, string>,
) => {
  const promise = fn();

  return (request: Request) =>
    promise.then((mod) => mod.default(request, params));
};

const lazyMiddleware = (
  fn: () => Promise<{
    default: Middleware<Empty> | Middleware<Empty>[];
  }>,
) => {
  const promise = fn().then((mod) => combineMiddlewares(mod.default));

  return (
    request: Request,
    next: (request: Request) => Thenable<Response>,
    context: () => Thenable<Empty>,
  ) => promise.then((middleware) => middleware(request, next, context));
};

export const lazy = {
  page: lazyComponent,
  layout: lazyLayout,
  serve: lazyServe,
  middleware: lazyMiddleware,
};

export { useRouter };
