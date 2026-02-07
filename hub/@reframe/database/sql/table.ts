import { t as s } from "@reframe/shapes/main.ts";

import {
  As,
  Compilable,
  COMPILE,
  compile,
  Composite,
  composite,
  Expression,
  Identifier,
  identifier,
  INDENT,
  isExpression,
  isIdentifier,
  literalExpression,
  NODENT,
  Scalar,
  scalar,
  TableColumns,
  UNDENT,
} from "./core.ts";

import { and } from "./operator.ts";

type TableSelection =
  | TableColumns
  | {
    [key in string]: TableSelection;
  };

type SelectionColumns<S extends TableSelection> = S extends
  Record<string, TableSelection> ? Composite<
    {
      [K in keyof S & string]: SelectionColumns<S[K]>;
    }
  >
  : S;

type MergeTableColumns<
  A extends TableColumns,
  B extends { [key: string]: TableColumns },
> = A extends Composite<infer T> ? Composite<T & B> : A;

export type Scaled<T extends TableColumns> = T extends Composite<infer U>
  ? { [K in keyof U]: Scaled<U[K]> }
  : s.Out<T>;

const combine = <T extends TableColumns>(columns: T): Scalar<Scaled<T>> => {
  if (!(Composite in columns)) {
    return columns as Scalar<Scaled<T>>;
  }

  return scalar(
    (opts) => [
      ["case when", compile(columns, opts), "is null then null else", [
        `json_object(`,
        INDENT,
        Object.entries(columns)
          .map(([key, value], index) => {
            return [
              index === 0 ? " " : [NODENT, ","],
              `'${key}',`,
              compile(
                combine(value),
                opts,
              ),
            ];
          }),
        UNDENT,
        `)`,
      ], "end"],
    ],
  );
};

const TableKind = Symbol.for("Table.Expression");
interface _Table<
  Columns extends TableColumns = TableColumns,
> extends Compilable {
  columns: Columns;
}

export interface TableExpression<Columns extends TableColumns = TableColumns>
  extends _Table<Columns> {
  [TableKind]: "Expression";
}

export interface TableReference<Columns extends TableColumns = TableColumns>
  extends _Table<Columns> {
  [TableKind]: "Reference";
}

type __Table<T extends TableColumns = TableColumns> =
  | TableExpression<T>
  | TableReference<T>;

export interface Filterable<T extends TableColumns = TableColumns>
  extends TableExpression<T> {
  where: (c: (_: this["columns"]) => Expression<boolean>) => Filterable<T>;
}

export interface Selectable<Columns extends TableColumns = TableColumns>
  extends Filterable<Columns> {
  select: <Selection extends TableSelection>(
    _: (_: this["columns"]) => Selection,
  ) => Selectable<SelectionColumns<Selection>>;

  joinMany: <Name extends string, Right extends Filterable>(
    name: Name,
    right: Right,
    on: (
      right: Right["columns"],
      left: this["columns"],
    ) => Expression<boolean>,
  ) => Selectable<
    MergeTableColumns<
      Columns,
      { [K in Name]: Scalar<Scaled<Right["columns"]>[]> }
    >
  >;
}

export interface Joinable<
  Base extends TableReference = TableReference,
  Joins extends Record<string, TableExpression> = Record<
    string,
    TableExpression
  >,
> extends
  Selectable<
    MergeTableColumns<
      Base["columns"],
      { [K in keyof Joins]: Joins[K]["columns"] }
    >
  > {
  joinOne: <Name extends string, Right extends TableExpression>(
    name: Name,
    right: Right,
    on: (
      right: Right["columns"],
      left: this["columns"],
    ) => Expression<boolean>,
  ) => Joinable<Base, Joins & Record<Name, Right>>;
}

const filterable = <T extends TableColumns>(
  base: TableExpression<T>,
  condition?: Expression<boolean>,
): Filterable<T> => ({
  ...base,

  where: (c) =>
    filterable(
      base,
      condition ? and(condition, c(base.columns)) : c(base.columns),
    ),

  [COMPILE]: (opts) => [
    compile(base, opts),
    condition
      ? [
        NODENT,
        "WHERE",
        compile(condition, opts),
      ]
      : [],
  ],
});

const selectionToColumns = <S extends TableSelection>(
  selection: S,
): SelectionColumns<S> => {
  if (isExpression(selection) && !(Composite in selection)) {
    return selection as SelectionColumns<S>;
  }

  return composite(
    Object.fromEntries(
      Object.entries(selection)
        .map(([key, value]) => [
          key,
          selectionToColumns(value),
        ]),
    ),
    Composite in selection ? selection : literalExpression(43),
  ) as SelectionColumns<S>;
};

const mapColumns = <T extends TableColumns>(
  columns: T,
  fn: <U>(value: Scalar<U>, path: string[]) => Scalar<U>,
  path: string[] = [],
): T => {
  if (Composite in columns) {
    return composite(
      Object.fromEntries(
        Object.entries(columns)
          .map(([key, value]) => [key, mapColumns(value, fn, [...path, key])]),
      ),
      fn(columns, path),
    ) as T;
  }

  return fn(columns, path) as T;
};

const flatten = <T extends TableColumns>(columns: T): Scalar[] => {
  if (Composite in columns) {
    return [
      columns,
      ...Object.values(columns).flatMap(flatten),
    ];
  }

  return [columns];
};

const createReferenceFromExpression = <T extends TableColumns>(
  table: TableExpression<T>,
  prefix?: string,
): TableReference<T> => ({
  ...table,
  columns: mapColumns(
    table.columns,
    (value) => prefix ? withNextScope(prefix, value) : value,
  ),
  [TableKind]: "Reference",
  [COMPILE]: (opts) => [
    "(",
    INDENT,
    compile(
      prefix ? withNextScope(prefix, table) : table,
      opts,
    ),
    UNDENT,
    ")",
  ],
});

export const createTableReference = <
  Columns extends Record<
    string,
    s.Shape
  >,
>(
  name: string,
  columns: Columns,
) =>
  joinable({
    [TableKind]: "Reference",

    columns: composite(
      Object.entries(columns)
        .reduce(
          (acc, [key]) => ({ ...acc, [key]: identifier(() => key) }),
          {} as {
            [K in keyof Columns]: Scalar<s.Out<Columns[K]>>;
          },
        ),
      literalExpression(44),
    ),
    [COMPILE]: () => [name],
  } as TableReference<
    Composite<{ [K in keyof Columns]: Scalar<s.Out<Columns[K]>> }>
  >, {});

const withNextScope = <T extends Compilable>(
  prefix: string,
  value: T,
): T => ({
  ...value,
  [COMPILE]: (opts) =>
    compile(value, { ...opts, scope: opts.scope.next(prefix) }),
  // { ctx: ctx => ctx.next(prefix) }),
});

const withPrevScope = <T extends Compilable>(
  value: T,
): T => ({
  ...value,
  [COMPILE]: (opts) => compile(value, { ...opts, scope: opts.scope.prev() }),
});

const _selectable = <Columns extends TableColumns>(
  from: TableReference,
  columns: Columns,
): Selectable<Columns> => {
  const idenfiers = mapColumns(
    columns,
    (value, path) =>
      isIdentifier(value) ? value : identifier(
        (opts) => opts.scope.current() + "$" + path.join("_$"),
        value,
      ),
  );

  return {
    ...filterable({
      [TableKind]: "Expression",

      columns: mapColumns(
        idenfiers,
        (value) =>
          isIdentifier(value)
            ? identifier((opts) => value[Identifier](opts))
            // this should never happen due to the mapColumns call above
            : value,
      ),

      [COMPILE]: (opts) => [
        "select",
        flatten(idenfiers)
          .map((column, index) => [
            index === 0 ? INDENT : [NODENT, ","],
            compile(column, opts),
            (isIdentifier(column) && column[As])
              ? ["as", column[Identifier](opts)]
              : [],
          ]),
        UNDENT,
        NODENT,
        "from",
        compile(from, opts),
      ],
    }),

    select: (s) => _selectable(from, selectionToColumns(s(idenfiers))),

    joinMany: <Name extends string, Right extends Filterable>(
      name: Name,
      right: Right,
      on: (
        right: Right["columns"],
        left: Columns,
      ) => Expression<boolean>,
    ) =>
      _selectable(
        from,
        selectionToColumns({
          ...idenfiers,
          [name]: scalar((opts) =>
            compile(
              createReferenceFromExpression(
                selectable(
                  createReferenceFromExpression(
                    right.where((r) =>
                      on(
                        r,
                        mapColumns(
                          idenfiers,
                          (value) => withPrevScope(value),
                        ),
                      )
                    ),
                    name,
                  ),
                ).select(
                  (row) =>
                    scalar(
                      (opts) => [
                        `json_group_array(`,
                        INDENT,
                        compile(combine(row), opts),
                        UNDENT,
                        ")",
                      ],
                    ),
                ),
              ),
              opts,
            )
          ),
        }) as {} as MergeTableColumns<
          Columns,
          { [L in Name]: Scalar<Scaled<Right["columns"]>[]> }
        >,
      ),
  };
};

const selectable = <Columns extends TableColumns>(
  base: TableReference<Columns>,
): Selectable<Columns> => _selectable(base, base.columns);

const merge = <
  A extends TableColumns,
  B extends { [key: string]: TableColumns },
>(a: A, b: B): MergeTableColumns<A, B> => {
  if (Composite in a) {
    return composite({
      ...a,
      ...b,
    }, a) as MergeTableColumns<A, B>;
  }

  return a as MergeTableColumns<A, B>;
};

export const joinable = <
  Base extends TableReference,
  Joins extends Record<string, {
    table: TableExpression;
    on: Expression<boolean>;
  }>,
>(
  base: Base,
  joins: Joins,
) => {
  const columns = merge(
    mapColumns(
      base.columns,
      (value, path) =>
        isIdentifier(value)
          ? identifier(
            (opts) => opts.scope.current() + value[Identifier](opts),
            scalar((
              opts,
            ) => [opts.scope.current() + "." + value[Identifier](opts)]),
          )
          : value,
    ),
    Object.fromEntries(
      Object.entries(joins)
        .map(([name, { table }]) => [
          name,
          mapColumns(
            table.columns,
            (value, path) => {
              if (!isIdentifier(value)) {
                throw new Error("table columns must be identifiers");
              }

              return identifier(
                (opts) =>
                  value[Identifier]({
                    ...opts,
                    scope: opts.scope.next(name),
                  }),
              );
            },
          ),
        ]),
    ),
  ) as (typeof table)["columns"];

  const table: Joinable<
    Base,
    { [K in keyof Joins & string]: Joins[K]["table"] }
  > = {
    ...selectable({
      [TableKind]: "Reference",

      columns,

      [COMPILE]: (opts) => [
        compile(base, opts),
        "as",
        opts.scope.current(),

        Object.entries(joins)
          .map(([name, { table, on }]) => [
            NODENT,
            NODENT,
            "left join",
            compile(table, opts),
            "as",
            opts.scope.current() + name + "_$",
            "on",
            compile(on, opts),
          ]),
      ],
    }),

    joinOne: <Name extends string, Right extends TableExpression>(
      name: Name,
      _right: Right,
      on: (
        right: Right["columns"],
        left: typeof columns,
      ) => Expression<boolean>,
    ) => {
      const right = createReferenceFromExpression(_right, name);

      return joinable(
        base,
        {
          ...joins,
          [name]: {
            table: right,
            on: on(
              right.columns,
              columns,
            ),
          },
        } as
          & typeof joins
          & Record<Name, { table: Right; on: Expression<boolean> }>,
      );
    },
  };

  return table;
};
