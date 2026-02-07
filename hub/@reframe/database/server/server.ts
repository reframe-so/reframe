import { Adapter } from "../adapter/adapter.ts";
import * as t from "../sql/index.ts";
import { t as s } from "@reframe/shapes/main.ts";
import { v4 } from "npm:uuid@latest";

export type CreatePayload<T extends t.Table> = {
  [K in keyof T["columns"]]: t.Out<T["columns"][K]>;
};

export type ReadFilter<T extends t.Table> = {
  [K in keyof T["columns"]]?: t.Match<t.Out<T["columns"][K]>>;
};

export type UpdateFilter<T extends t.Table> = {
  [K in keyof T["columns"]]?: t.Match<t.Out<T["columns"][K]>>;
};

export type UpdateSet<T extends t.Table> = {
  [K in keyof T["columns"]]?: t.Update<t.Out<T["columns"][K]>>;
};

export type DeleteFilter<T extends t.Table> = {
  [K in keyof T["columns"]]?: t.Match<t.Out<T["columns"][K]>>;
};

export type Row<T extends t.Table> = {
  [K in keyof T["columns"]]: t.Out<T["columns"][K]>;
};

type TableOperations<T extends t.Table> = {
  // todo: conflict
  create: (data: CreatePayload<T>) => Promise<Row<T>>;

  // todo: readUnique
  // only support read by index?
  // have another danger: true flag to delete by non unique key
  read: (_: {
    where?: ReadFilter<T>;
    order?: {
      [K in keyof T["columns"]]?: "asc" | "desc";
    };
    limit?: number;
    offset?: number;
  }) => Promise<Array<Row<T>>>;

  update: (
    // only support delete by unique key
    // have another danger: true flag to delete by non unique key
    _: { where: UpdateFilter<T>; set: UpdateSet<T> },
  ) => Promise<Array<Row<T>>>;

  delete: (
    // only support delete by unique key
    // have another danger: true flag to delete by non unique key
    _: {
      where: DeleteFilter<T>;
    },
  ) => Promise<Array<Row<T>>>;
};

type Operations<T extends Record<string, t.Table>> = {
  [K in keyof T]: K extends `$${string}` ? unknown : TableOperations<T[K]>;
};

type SyncOpts = {
  dropTables?: boolean;
};

type MaybePromise<T> = T | Promise<T>;
const then = <I, O>(
  promise: MaybePromise<Awaited<I>>,
  fn: (value: Awaited<I>) => MaybePromise<O>,
): MaybePromise<O> =>
  promise instanceof Promise ? promise.then(fn) : fn(promise);

export type Server<S extends t.Schema> = Operations<S["tables"]> & {
  $utils: {
    uuid: () => string;
  };
  $schema: {
    remote: () => MaybePromise<t.Schema>;
    diff: (opts?: SyncOpts) => MaybePromise<t.SchemaDiff>;
    apply: (_: t.SchemaDiff) => MaybePromise<void>;
    sync: (opts?: SyncOpts) => MaybePromise<void>;
  };
  $transaction: <R>(
    fn: (tx: Operations<S["tables"]>) => Promise<void>,
  ) => Promise<void>;
};

export const server = <S extends t.Schema, A extends Adapter<t.InputValue>>(
  schema: S,
  { adapter }: { adapter: A },
): Server<S> => {
  const $schema: Server<S>["$schema"] = {
    remote: () => adapter.readSchema(),

    sync: (opts) => then($schema.diff(opts), (diff) => $schema.apply(diff)),

    diff: (opts) =>
      then($schema.remote(), (remote) =>
        t.diff(remote, schema, {
          extends: adapter.columnExtends,
          dropTables: !!opts?.dropTables,
        }),
      ),

    apply: (diff) =>
      adapter.batch((tx) => {
        for (const [table, tableDiff] of Object.entries(diff.tables)) {
          if (tableDiff.type === "create") {
            tx.createTable(table, tableDiff.create);
            continue;
          }

          if (tableDiff.type === "drop") {
            tx.dropTable(table);
            continue;
          }

          if (tableDiff.type === "alter") {
            for (const [column, columnDiff] of Object.entries(
              tableDiff.alter.columns,
            )) {
              if (columnDiff.type === "drop") {
                tx.dropColumn(table, column);
              } else if (columnDiff.type === "create") {
                tx.createColumn(table, column, columnDiff.create);
              }
            }

            for (const index of tableDiff.alter.indices) {
              if (index.type === "drop") {
                tx.dropIndex(table, index.columns);
              }
            }

            for (const index of tableDiff.alter.indices) {
              if (index.type === "create") {
                tx.createIndex(table, index.columns, index.unique);
              }
            }
          }
        }
      }),
  };

  const createTableOperation = <T extends t.Table>(
    tx: Omit<A, "transaction">,
    name: string,
    table: T,
  ): TableOperations<T> => {
    const createShape = s.object(table.columns) as s.Extended<
      s.Object<T["columns"]>
    >;
    const readShape = s.object(table.columns) as s.Extended<
      s.Object<T["columns"]>
    >;

    const readQueryShape = s.object({
      where: s
        .object(
          Object.fromEntries(
            Object.entries(table.columns).map(([key, value]) => [
              key,
              t.matchShape(value).optional(),
            ]),
          ),
        )
        .optional(),
      order: s
        .record(
          s.union(Object.keys(table.columns).map((key) => s.literal(key))),
          s.union([s.literal("asc"), s.literal("desc")]).optional(),
        )
        .optional(),
      limit: s.number().optional(),
      offset: s.number().optional(),
    });

    const updateQueryShape = s.object({
      where: s.object(
        Object.fromEntries(
          Object.entries(table.columns).map(([key, value]) => [
            key,
            t.matchShape(value).optional(),
          ]),
        ),
      ),
      set: s.object(
        Object.fromEntries(
          Object.entries(table.columns).map(([key, value]) => [
            key,
            t.updateShape(value).optional(),
          ]),
        ),
      ),
    });

    const deleteQueryShape = s.object({
      where: s.object(
        Object.fromEntries(
          Object.entries(table.columns).map(([key, value]) => [
            key,
            t.matchShape(value).optional(),
          ]),
        ),
      ),
    });

    return {
      create: async (values) => {
        const rows = await tx.create(name, [createShape.write(values)]);

        return readShape.read(rows[0]);
      },

      read: async (_) => {
        const rows = await tx.read(name, readQueryShape.write(_));
        return rows.map((row) => readShape.read(row));
      },

      update: async (_) => {
        const rows = await tx.update(name, updateQueryShape.write(_));

        return rows.map((row) => readShape.read(row));
      },

      delete: async (_) => {
        const rows = await tx.delete(name, deleteQueryShape.write(_));

        return rows.map((row) => readShape.read(row));
      },
    };
  };

  const createTableOperations = (tx: Omit<A, "transaction">) => {
    const operations = {} as Operations<S["tables"]>;

    for (const table in schema.tables) {
      Reflect.set(
        operations,
        table,
        createTableOperation(tx, table, schema.tables[table]),
      );
    }

    return operations;
  };

  const server = {
    $utils: {
      uuid: () => v4(),
    },
    $schema,
  } as Server<S>;

  const operations = createTableOperations(adapter);
  for (const table in schema.tables) {
    Reflect.set(server, table, Reflect.get(operations, table));
  }

  return server;
};
