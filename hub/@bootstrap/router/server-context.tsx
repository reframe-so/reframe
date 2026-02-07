import type React from "npm:react";

import {
  isClientComponent,
  isReactComponentClass,
  isReactElement,
  isSimpleObject,
} from "./is.ts";

const REFRAME_SERVER_CONTEXT_PROVIDER = Symbol(
  "reframe.server.context.provider",
);

const isProvider = (value: unknown): value is {
  $$signature: symbol;
} => {
  return typeof value === "function" && "$$typeof" in value &&
    value.$$typeof === REFRAME_SERVER_CONTEXT_PROVIDER;
};

let count = 0;
const createProvider = <Ctx,>(
  valueMap: Map<
    React.ComponentType<
      { use: (ctx: unknown) => React.ReactNode }
    >,
    unknown
  >,
  name?: string,
): <T>(value: T) => T => {
  const signature = Symbol(name + String(count++));

  const providedConsumers = new WeakMap<
    React.ComponentType<{
      use: (ctx: unknown) => React.ReactNode;
    }>,
    React.ComponentType<{
      use: (ctx: unknown) => React.ReactNode;
    }>
  >();

  const createProvidedConsumer = (
    Consumer: React.ComponentType<{
      use: (ctx: unknown) => React.ReactNode;
    }>,
  ):
    & React.ComponentType<{
      use: (ctx: unknown) => React.ReactNode;
    }>
    & { [signature]: true } => {
    if (providedConsumers.has(Consumer)) {
      return providedConsumers.get(Consumer)! as unknown as
        & React.ComponentType<
          {
            use: (ctx: unknown) => React.ReactNode;
          }
        >
        & {
          [signature]: true;
        };
    }

    const Component = (props: {
      use: (ctx: unknown) => React.ReactNode;
    }) => {
      const value = valueMap.get(Consumer)!;

      // check if promise
      if (value instanceof Promise) {
        return provide(value.then((value) => props.use(value)));
      }

      return provide(props.use(value));
    };

    Component[signature] = true;

    providedConsumers.set(
      Consumer,
      Component as unknown as React.ComponentType<
        {
          use: (ctx: unknown) => React.ReactNode;
        }
      >,
    );

    // @ts-expect-error Type 'Promise<...>' is not assignable to type 'ReactNode'
    return Component;
  };

  const debug = {
    call: 0,
    hit: {
      map: 0,
      set: 0,
      miss: 0,
    },
  };

  const cache = new WeakMap();

  const withCache = <Fn extends (_: any) => any>(fn: Fn): Fn => {
    return ((value) => {
      if (signature in value) {
        debug.hit.set++;
        return value;
      }

      if (cache.has(value)) {
        debug.hit.map++;
        return cache.get(value);
      }

      debug.hit.miss++;

      const computed = fn(value);
      // if (!computed) {
      //   return computed;
      // }

      cache.set(value, computed);
      computed[signature] = true;

      return computed;
    }) as Fn;
  };

  const providePromise = withCache(<T extends Promise<unknown>>(value: T): T =>
    value.then((value) => provide(value)) as T
  );

  const provideArray = withCache(<T extends unknown[]>(value: T): T =>
    value.map((value) => provide(value)) as T
  );

  const provideMap = withCache(<T extends Map<unknown, unknown>>(value: T): T =>
    new Map(
      Array.from(value.entries())
        .map(([key, value]) => [
          provide(key),
          provide(value),
        ]),
    ) as T
  );

  const provideSet = withCache(<T extends Set<unknown>>(value: T): T =>
    new Set(
      Array.from(value.values())
        .map((value) => provide(value)),
    ) as T
  );

  const provideSimpleObject = withCache(<T extends Record<string, unknown>>(
    value: T,
  ): T =>
    Object.fromEntries(
      Object.entries(value)
        .map(([key, value]) => [
          key,
          provide(value),
        ]),
    ) as T
  );

  const provideReactComponent = withCache(
    <T extends React.ComponentType>(component: T): T => {
      if (isReactComponentClass(component)) {
        throw new Error("class components are not supported on the server");
      }

      return ((props: React.ComponentProps<T>) =>
        provide(component(props))) as T;
    },
  );

  const provideReactElement = withCache(<T extends React.ReactElement>(
    element: T,
  ): T => {
    const type = element.type;

    // host components
    if (typeof type !== "function") {
      const props = element.props as Record<string, unknown>;
      return {
        ...element,
        props: {
          ...props,
          children: provide(props.children),
        },
      } as T;
    }

    if (valueMap.has(type)) {
      // this is a consumer
      return {
        ...element,
        type: createProvidedConsumer(type),
      };
    }

    if (isProvider(type)) {
      const props = element.props as Record<string, unknown>;
      return {
        ...element,
        props: {
          ...props,
          valueMap: new Map(valueMap),
        },
      };
    }

    if (isClientComponent(type)) {
      return {
        ...element,
        props: provide(element.props),
      } as T;
    }

    // other component
    return {
      ...element,
      type: provideReactComponent(type),
    } as T;
  });

  const provide = <T,>(value: T): T => {
    debug.call++;

    if (value instanceof Promise) {
      return providePromise(value);
    }

    if (Array.isArray(value)) {
      return provideArray(value);
    }

    if (value instanceof Map) {
      return provideMap(value);
    }

    if (value instanceof Set) {
      return provideSet(value);
    }

    if (isReactElement(value)) {
      return provideReactElement(value);
    }

    if (isSimpleObject(value)) {
      return provideSimpleObject(value);
    }

    return value;
  };

  return provide;
};

export function createContext<Ctx>(name?: string) {
  function Consumer(_: {
    use: (ctx: Ctx) => React.ReactNode | Promise<React.ReactNode>;
    name?: string;
  }): React.ReactNode {
    throw new Error(
      `Consumer<${_.name}> should be used inside Provider<${name}>`,
    );
  }

  function Provider({
    value,
    children,
    valueMap: _valueMap,
  }: {
    value: Ctx;
    children: React.ReactNode;
    valueMap?:
      & Map<
        React.ComponentType<
          { use: (ctx: unknown) => React.ReactNode }
        >,
        unknown
      >
      & {
        __brand: symbol;
      };
  }) {
    const valueMap = _valueMap ?? new Map<
      React.ComponentType<
        { use: (ctx: unknown) => React.ReactNode }
      >,
      unknown
    >();

    valueMap.set(
      Consumer as unknown as React.ComponentType<{
        use: (ctx: unknown) => React.ReactNode;
      }>,
      value,
    );

    const provide = createProvider(
      valueMap,
      name,
    ) as <
      T,
    >(value: T) => T;

    return provide(children);
  }

  Provider.$$typeof = REFRAME_SERVER_CONTEXT_PROVIDER;

  Consumer.Provider = Provider;
  Consumer.$$name = name;

  return Consumer;
}
