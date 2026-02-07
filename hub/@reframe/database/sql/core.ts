import { t as s } from "@reframe/shapes/main.ts";
export { type Out } from "@reframe/shapes/t.ts";

export const INDENT = Symbol.for("INDENT");
export const UNDENT = Symbol.for("UNDENT");
export const NODENT = Symbol.for("NODENT");
export const COMPILE = Symbol.for("COMPILE");

export type SQL =
  | string
  | Array<
    SQL | typeof INDENT | typeof UNDENT | typeof NODENT
  >;

export type Variable<S extends { [s.OUT]: unknown }> = S extends
  s.Extended<infer U> ? Variable<U>
  : S extends s.Object<infer U>
    ? Composite<{ [K in keyof S["properties"]]: Variable<U[K]> }>
  : Scalar<s.Out<S>>;

export type Operator<
  Name extends string,
  Args extends unknown[],
> = Expression<boolean> & {
  name: Name;
  args: Args;
};

export type Expression<T> = Compilable & {
  [s.OUT]: T;
};

export type CompileOptions = {
  scope: Scope;
  args: Map<string, unknown>;
};

export type Compilable<Options extends CompileOptions = CompileOptions> = {
  [COMPILE]: (opts: Options) => SQL;
};

export interface Scalar<T = unknown> extends Expression<T> {}

export const Composite = Symbol.for("Composite");

export const Identifier = Symbol.for("Identifier");
export const As = Symbol.for("Identifier.As");
export interface Identifier<T> extends Scalar<T> {
  [Identifier]: (opts: CompileOptions) => string;
  [As]: boolean;
}

export const isIdentifier = <T>(value: Scalar<T>): value is Identifier<T> =>
  Identifier in value;

export type Composite<
  T extends Record<string, TableColumns>,
> = Expression<unknown> & {
  [Composite]: true;
} & T;

export type TableColumns =
  | Scalar
  | Composite<{
    [key: string]: TableColumns;
  }>;

type Scope = {
  current: () => string;
  next: (_: string) => Scope;
  prev: () => Scope;
  symbol: () => string;
  counter: () => number;
};

export const identifier = <T>(
  name: (opts: CompileOptions) => string,
  expression?: Scalar<T>,
): Identifier<T> => ({
  ...scalar((opts) => expression ? compile(expression, opts) : name(opts)),
  [Identifier]: name,
  [As]: expression !== undefined,
});

export const composite = <T extends Record<string, TableColumns>>(
  columns: T,
  scalar: Scalar<unknown>,
): Composite<T> => ({
  ...scalar,
  ...columns,

  [Composite]: true,
});

export const createScope = (scope: string[]) => {
  const count = { value: 0 };

  const self: Scope = {
    current: () => scope.join("_$") + "_$",
    next: (name: string) => createScope([...scope, name]),
    prev: () => createScope(scope.slice(0, -1)),
    counter: () => count.value++,
    symbol: () => self.current() + self.counter(),
  };

  return self;
};

export const compilable = (
  compile: (opts: CompileOptions) => SQL,
): Compilable => ({
  [COMPILE]: compile,
});

export const executable = <Value>(
  compile: (opts: CompileOptions) => SQL,
  _args: Record<string, Value>,
): {
  sql: string;
  args: Record<string, Value>;
} => {
  const scope = createScope(["t"]);

  const args = new Map(Object.entries(_args));

  const sql = compile({ scope, args });

  return {
    sql: compileSql(sql),
    args: Object.fromEntries(args.entries()),
  };
};

export const escape = (identifier: string) =>
  `\`${identifier.replace(/`/g, "``")}\``;

export const compile = (arg: unknown, opts: CompileOptions) => {
  try {
    const compilable = isCompilable(arg) ? arg : literalExpression(arg);

    return compilable[COMPILE](opts);
  } catch (error) {
    throw error;
  }
};

export const compileSql = (sql: SQL) => {
  if (typeof sql === "string") {
    return sql;
  }

  const copy = <T>(value: T): T =>
    Array.isArray(value) ? value.map(copy) as T : value as T;

  let indent = 0;
  const result = [] as string[];
  const stack = [copy(sql)] as Exclude<SQL, string>;

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (typeof current === "string") {
      result.push(current, " ");
    } else if (current === NODENT) {
      result.push(`\n${"  ".repeat(indent)}`);
    } else if (current === INDENT) {
      indent++;
      result.push(`\n${"  ".repeat(indent)}`);
    } else if (current === UNDENT) {
      indent--;
      result.push(`\n${"  ".repeat(indent)}`);
    } else {
      stack.push(...current.reverse());
    }
  }

  return result.join("");
};

export const isCompilable = (value: unknown): value is Compilable =>
  typeof value === "object" &&
  value !== null &&
  COMPILE in value;

export const isExpression = (value: unknown): value is Expression<unknown> =>
  isCompilable(value) &&
  s.OUT in value;

export const scalar = <T>(
  compile: (opts: CompileOptions) => SQL,
): Scalar<T> => ({
  [s.OUT]: {} as T,
  [COMPILE]: compile,
});

export const literalExpression = <T>(arg: T): Expression<T> => {
  if (arg === undefined) {
    throw new Error("undefined is not allowed");
  }

  if (typeof arg === "boolean" || typeof arg === "number" || arg === null) {
    return scalar(() => [arg === null ? "NULL" : arg.toString()]);
  }

  return scalar((opts) => {
    const name = `$$${opts.scope.symbol()}`;
    opts.args.set(
      name,
      typeof arg === "string" || arg instanceof Uint8Array
        ? arg
        : JSON.stringify(arg),
    );
    return [name];
  });
};

export type VariableSelection = {
  [_: string]: VariableSelection;
};

export const variable = <T extends TableColumns>(
  name: string,
  accessed: VariableSelection = {},
  path: string[] = [],
) => {
  return new Proxy(
    {},
    {
      has: (_, key) => [COMPILE, s.KIND, s.OUT].includes(key as symbol),

      get: (_, key) => {
        if (key === COMPILE) {
          return () => [`(${name} ->> '$.${path.join(".")}')`];
        }

        if (typeof key === "string") {
          accessed[key] ??= {};
          return variable(name, accessed[key], [...path, key]);
        }

        return undefined;
      },
    },
  ) as T;
};
