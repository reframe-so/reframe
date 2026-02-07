import * as t from "../sql/index.ts";
import { Adapter } from "./adapter.ts";
import { Client, createClient, Transaction, Value } from "npm:@libsql/client";

type Config = Parameters<typeof createClient>[0];

type LibsqlAdapter = Adapter<
  number | string | null | Uint8Array
>;

export const libsql = (config: Config): LibsqlAdapter => {
  const tx = (
    client: Client,
    fn: (tx: Transaction) => Promise<void>,
  ) =>
    client.transaction("write").then(async (tx) => {
      try {
        await fn(tx);
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      } finally {
        tx.close();
      }
    });

  const getTableMetadata = async (
    client: Client | Transaction,
    table: string,
  ) => {
    const columns = await client.execute(`pragma table_info(${table})`);
    const indices = await client.execute(` 
          select
            i.name as name,
            i.\`unique\` as "unique",
            i.origin as origin,
            c.name as column,
            c.seqno as "order"
          from pragma_index_list('${table}') as i
          left join pragma_index_info(i.name) as c on true
        `);

    const metadata: t.CreateTablePayload & {
      _indexMap: Map<string, {
        columns: string[];
        unique: boolean;
        primary: boolean;
      }>;
    } = {
      columns: {},
      primaryKey: [],
      indices: [],
      _indexMap: new Map(),
    };

    for (const row of columns.rows) {
      metadata.columns[String(row.name)] = {
        type: (
            row.type === "INTEGER" ||
            row.type === "REAL" ||
            row.type === "NUMERIC"
          )
          ? "number"
          : row.type === "TEXT"
          ? "string"
          : "blob",

        nullable: row.notnull === 0,
      };
    }

    // build primary index
    metadata.primaryKey = columns.rows
      .filter((row) => Number(row.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((row) => String(row.name));

    const indicesMap: Map<
      string,
      {
        columns: Map<number, string>;
        unique: boolean;
        primary: boolean;
      }
    > = new Map();

    for (const row of indices.rows) {
      const name = String(row.name);
      const index = indicesMap.get(name);
      if (!index) {
        indicesMap.set(name, {
          columns: new Map(),
          unique: row.unique === 1,
          primary: row.origin === "pk",
        });
      }

      indicesMap.get(name)!.columns.set(
        Number(row.order),
        String(row.column),
      );
    }

    for (const [name, index] of indicesMap.entries()) {
      const columns = Array.from(index.columns.entries())
        .sort(([a], [b]) => a - b)
        .map(([, column]) => column);

      metadata._indexMap.set(name, {
        columns,
        unique: index.unique,
        primary: index.primary,
      });

      // skip primary key
      if (index.primary) {
        continue;
      }

      const existingIndex = metadata.indices.find((i) =>
        i.columns.join(",") === columns.join(",")
      );

      if (existingIndex) {
        existingIndex.unique = existingIndex.unique || index.unique;
      } else {
        metadata.indices.push({
          columns,
          unique: index.unique,
        });
      }
    }

    return metadata;
  };

  const createAdapter = (
    client: Client,
  ): Omit<LibsqlAdapter, "batch"> => {
    const clean = (row: Record<string, Value>) => {
      const columns = Object.keys(row);
      const result: Record<string, string | number | null | Uint8Array> = {};
      for (const column of columns) {
        result[column] = typeof row[column] === "bigint"
          ? Number(row[column])
          : row[column] instanceof ArrayBuffer
          ? new Uint8Array(row[column])
          : row[column];
      }
      return result;
    };

    const adapter: Omit<LibsqlAdapter, "batch"> = {
      columnExtends: (a, b) =>
        (a === "number" && b === "boolean") ||
        (a === "string" && b === "json"),

      readTable: async (name: string) => {
        const metadata = await getTableMetadata(client, name);
        const columns = Object.fromEntries(
          Object.entries(metadata.columns)
            .map(([name, type]) => {
              const column = type.type === "number"
                ? t.number()
                : type.type === "string"
                ? t.string()
                : type.type === "boolean"
                ? t.boolean()
                : type.type === "json"
                ? t.json()
                : t.blob();

              return [
                name,
                type.nullable ? t.nullable(column) : column,
              ] as [
                string,
                t.ColumnShape<t.ShapeOf<t.InputValue, unknown>>,
              ];
            }),
        );

        let _table: t.TableFactory = t.table(columns)
          .primary(...metadata.primaryKey);

        for (const index of metadata.indices) {
          if (index.unique) {
            _table = _table.unique(...index.columns);
          } else {
            _table = _table.index(...index.columns);
          }
        }

        return _table;
      },

      readSchema: async () => {
        const tables = await client.execute(`
            SELECT name FROM sqlite_master
            WHERE type='table'
            AND name NOT LIKE 'sqlite_%'
          `);

        const _tables: Record<string, t.Table> = {};

        for (const row of tables.rows) {
          _tables[String(row.name)] = await adapter.readTable(String(row.name));
        }

        return t.schema(_tables);
      },

      create: async (table, values) => {
        if (values.length === 0) {
          throw new Error("values must not be empty");
        }

        const columns = Object.keys(values[0]);

        const executable = t.executable<Value>((opts) => [
          [
            "with _",
            "(",
            t.INDENT,
            columns.map((
              column,
              index,
            ) => [index > 0 ? [","] : "", t.escape(column)]),
            t.UNDENT,
            ")",
          ],
          "as",
          [
            "(",
            t.INDENT,
            "values",
            values.map((row, index) => [
              index > 0 ? [","] : "",
              "(",
              t.INDENT,
              columns.map((column, index) => [
                index > 0 ? [","] : "",
                t.compile(row[column], opts),
              ]),
              t.UNDENT,
              ")",
            ]),
            t.UNDENT,
            ")",
          ],
          t.NODENT,
          [
            "insert into",
            t.escape(table),
            "(",
            t.INDENT,
            columns.map((
              column,
              index,
            ) => [index > 0 ? [","] : "", t.escape(column)]),
            t.UNDENT,
            ")",
          ],
          t.NODENT,
          "select _.* from _",
          t.NODENT,
          "returning *",
        ], {});

        // console.log(executable.sql, executable.args);

        const result = await client.execute(executable);

        return result.rows.map(clean);
      },

      read: async (table, {
        where = {},
        order = {},
        limit = 1000,
        offset = 0,
      }) => {
        const orderBy = Object.entries(order)
          .filter(([, direction]) =>
            direction === "asc" || direction === "desc"
          )
          .map(([column, direction], index) => [
            index > 0 ? [","] : "order by",
            t.escape(column),
            direction!,
          ]);

        const condition = Object.entries(where)
          .filter(([, value]) => value !== undefined)
          .map(([column, value]) => t.match(t.identifier(() => column), value));

        const executable = t.executable<Value>((opts) => [
          "select * from",
          t.escape(table),

          [t.NODENT, "where", t.compile(t.and(...condition), opts)],

          orderBy.length > 0 ? [t.NODENT, orderBy] : [],

          [t.NODENT, "limit", String(limit)],
          offset > 0 ? [t.NODENT, "offset", String(offset)] : "",
        ], {});

        // console.log(executable.sql, executable.args);
        const result = await client.execute(executable);

        return result.rows.map(clean);
      },

      update: async (table, { where, set }) => {
        const condition = Object.entries(where)
          .filter(([, value]) => value !== undefined)
          .map(([column, value]) =>
            t.match(t.identifier(() => t.escape(column)), value)
          );

        if (Object.keys(set).length === 0) {
          throw new Error("must set at least one column");
        }

        const updates = t.compilable((opts) =>
          Object.entries(set)
            .filter(([, value]) => value !== undefined)
            .map(([column, value], index) => [
              index > 0 ? [","] : [],
              t.escape(column),
              "=",
              t.compile(
                t.update(t.identifier(() => t.escape(column)), value),
                opts,
              ),
            ])
        );

        const executable = t
          .executable<Value>((opts) => [
            "update",
            t.escape(table),
            "set",
            t.compile(updates, opts),
            [t.NODENT, "where", t.compile(t.and(...condition), opts)],
            "returning *",
          ], {});

        // console.log(executable.sql, executable.args);
        const result = await client.execute(executable);

        return result.rows.map(clean);
      },

      delete: async (table, { where }) => {
        const condition = Object.entries(where)
          .filter(([, value]) => value !== undefined)
          .map(([column, value]) =>
            t.match(t.identifier(() => t.escape(column)), value)
          );

        const executable = t.executable<Value>((opts) => [
          "delete from",
          t.escape(table),
          [t.NODENT, "where", t.compile(t.and(...condition), opts)],
          "returning *",
        ], {});

        // console.log(executable.sql, executable.args);
        const result = await client.execute(executable);

        return result.rows.map(clean);
      },

      execute: async (query, params) => {
        try {
          let result;

          if (params) {
            // LibSQL client.execute can handle both named and positional parameters
            result = await client.execute({ sql: query, args: params });
          } else {
            result = await client.execute(query);
          }

          return result.rows.map(clean);
        } catch (error) {
          throw error;
        }
      },
    };

    return adapter;
  };

  async function createTable(
    tx: Transaction,
    table: string,
    payload: t.CreateTablePayload,
  ) {
    if (Object.entries(payload.columns).length === 0) {
      throw new Error(`table ${table} must have at least one column`);
    }

    if (payload.primaryKey.length === 0) {
      throw new Error(`table ${table} must have a primary key`);
    }

    const createTableStmt: t.SQL = [
      "CREATE TABLE",
      t.escape(table),
      "(",
      t.INDENT,
      Object.entries(payload.columns)
        .map(([name, type], index) => [
          index > 0 ? [t.NODENT, ","] : "",
          t.escape(name),
          type.type === "number"
            ? "INTEGER"
            : type.type === "string"
            ? "TEXT"
            : type.type === "boolean"
            ? "INTEGER"
            : type.type === "json"
            ? "TEXT"
            : "BLOB",
          type.nullable ? "NULL" : "NOT NULL",
        ]),

      t.NODENT,
      ",",
      "PRIMARY KEY",
      "(",
      t.INDENT,
      payload.primaryKey.map((name, index) => [
        index > 0 ? [", "] : "",
        t.escape(name),
      ]),
      t.UNDENT,
      ")",
      t.UNDENT,
      ")",
    ];

    const createIndexStmts = payload.indices.map((index): t.SQL => [
      "CREATE",
      index.unique ? "UNIQUE INDEX" : "INDEX",
      `${table}_${index.columns.join("_")}`,
      "ON",
      t.escape(table),
      "(",
      t.INDENT,
      index.columns.map((name, index) => [
        index > 0 ? [t.NODENT, ","] : "",
        t.escape(name),
      ]),
      t.UNDENT,
      ")",
    ]);

    const sql = t.compileSql([
      createTableStmt,
      ";",
      ...createIndexStmts.map((stmt): t.SQL => [t.NODENT, stmt, ";"]),
    ]);

    console.log(sql);

    await tx.executeMultiple(sql);
  }

  async function createColumn(
    tx: Transaction,
    table: string,
    column: string,
    payload: t.CreateColumnPayload,
  ) {
    await tx.execute(
      `ALTER TABLE ${t.escape(table)} ADD COLUMN ${t.escape(column)} ${
        payload.type === "number"
          ? "INTEGER"
          : payload.type === "string"
          ? "TEXT"
          : payload.type === "boolean"
          ? "INTEGER"
          : payload.type === "json"
          ? "TEXT"
          : "BLOB"
      } ${
        payload.nullable ? "NULL" : (
          `NOT NULL DEFAULT ${
            payload.type === "number"
              ? "0"
              : payload.type === "string"
              ? "''"
              : payload.type === "boolean"
              ? "0"
              : payload.type === "json"
              ? "'{}'"
              : "X'00'"
          }`
        )
      }`,
    );
  }

  async function dropTable(tx: Transaction, table: string) {
    await tx.execute(`DROP TABLE ${table}`);
  }

  async function dropColumn(tx: Transaction, table: string, column: string) {
    const metadata = await getTableMetadata(tx, table);

    if (metadata.primaryKey.includes(column)) {
      throw new Error(
        `cannot drop primary key column ${column} from ${table}`,
      );
    }

    for (const [name, index] of metadata._indexMap.entries()) {
      if (index.columns.includes(column)) {
        await dropIndex(tx, table, index.columns);
      }
    }
    await tx.execute(
      `ALTER TABLE ${t.escape(table)} DROP COLUMN ${t.escape(column)}`,
    );
  }

  async function createIndex(
    tx: Transaction,
    table: string,
    columns: string[],
    unique: boolean,
  ) {
    await tx.execute(
      t.compileSql([
        "CREATE",
        unique ? "UNIQUE INDEX" : "INDEX",
        `${table}_${columns.join("_")}${unique ? "_unique" : ""}`,
        "ON",
        t.escape(table),
        "(",
        t.INDENT,
        columns.map((name, index) => [
          index > 0 ? [t.NODENT, ","] : "",
          t.escape(name),
        ]),
        t.UNDENT,
        ")",
      ]),
    );
  }

  async function dropIndex(
    tx: Transaction,
    tableName: string,
    columns: string[],
  ) {
    const metadata = await getTableMetadata(tx, tableName);

    // find all named in metadata._indexMap that match columns
    const index = Array.from(metadata._indexMap.entries())
      .filter(([_, index]) =>
        index.columns.join(",") === columns.join(",") &&
        index.primary === false
      )
      .map(([name]) => name);

    for (const name of index) {
      await tx.execute(`DROP INDEX ${t.escape(name)}`);
    }
  }

  const _client = createClient(config);
  return {
    ...createAdapter(_client),
    batch: (fn) =>
      tx(_client, async (tx) => {
        const tasks: Array<() => Promise<void> | void> = [];
        fn({
          createTable: (...args) => tasks.push(() => createTable(tx, ...args)),
          dropTable: (...args) => tasks.push(() => dropTable(tx, ...args)),
          createColumn: (...args) =>
            tasks.push(() => createColumn(tx, ...args)),
          dropColumn: (...args) => tasks.push(() => dropColumn(tx, ...args)),
          createIndex: (...args) => tasks.push(() => createIndex(tx, ...args)),
          dropIndex: (...args) => tasks.push(() => dropIndex(tx, ...args)),
        });

        for (const task of tasks) {
          await task();
        }
      }),
  };
};
