import { DatabaseSync, StatementSync } from "node:sqlite";
import * as t from "../sql/index.ts";
import { Adapter } from "./adapter.ts";
import { measure } from "@reframe/aether/00-base/measure.ts";

type Config = {
  url: string;
};

type Value = number | string | null | Uint8Array;
type SqliteAdapter = Adapter<Value>;

export const sqlite = (config: Config): SqliteAdapter => {
  const client = new DatabaseSync(config.url);
  client.exec("PRAGMA journal_mode = WAL");
  client.exec("PRAGMA synchronous = NORMAL");
  client.exec("PRAGMA busy_timeout = 5000");
  client.exec("PRAGMA wal_autocheckpoint = 0");
  client.exec("PRAGMA cache_size = -64000");
  client.exec("PRAGMA mmap_size = 268435456");
  client.exec("PRAGMA temp_store = MEMORY");

  const preparedStatements = new Map<string, StatementSync>();

  const prepare = (sql: string) => {
    const cached = preparedStatements.get(sql);
    if (cached) return cached;
    const statement = client.prepare(sql);
    preparedStatements.set(sql, statement);
    return statement;
  };

  const getTableMetadata = (table: string) => {
    const columns = client.prepare(`pragma table_info(${table})`).all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }[];
    const indices = client.prepare(` 
        select
          i.name as name,
          i.\`unique\` as "unique",
          i.origin as origin,
          c.name as column,
          c.seqno as "order"
        from pragma_index_list('${table}') as i
        left join pragma_index_info(i.name) as c on true
      `).all() as {
      name: string;
      unique: number;
      origin: string;
      column: string;
      order: number;
    }[];

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

    for (const row of columns) {
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
    metadata.primaryKey = columns
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

    for (const row of indices) {
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

  function createTable(table: string, payload: t.CreateTablePayload) {
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

    client.exec(sql);
  }

  function dropTable(table: string) {
    client.exec(`DROP TABLE ${table}`);
  }

  function createColumn(
    table: string,
    column: string,
    payload: t.CreateColumnPayload,
  ) {
    client.exec(
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

  function dropColumn(table: string, column: string) {
    const metadata = getTableMetadata(table);

    if (metadata.primaryKey.includes(column)) {
      throw new Error(
        `cannot drop primary key column ${column} from ${table}`,
      );
    }

    for (const [name, index] of metadata._indexMap.entries()) {
      if (index.columns.includes(column)) {
        dropIndex(table, index.columns);
      }
    }

    client.exec(
      `ALTER TABLE ${t.escape(table)} DROP COLUMN ${t.escape(column)}`,
    );
  }

  function createIndex(table: string, columns: string[], unique: boolean) {
    client.exec(
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

  function dropIndex(tableName: string, columns: string[]) {
    const metadata = getTableMetadata(tableName);

    // find all named in metadata._indexMap that match columns
    const index = Array.from(metadata._indexMap.entries())
      .filter(([_, index]) =>
        index.columns.join(",") === columns.join(",") &&
        index.primary === false
      )
      .map(([name]) => name);

    for (const name of index) {
      client.exec(`DROP INDEX ${t.escape(name)}`);
    }
  }

  const createAdapter = (
    client: DatabaseSync,
  ): Omit<SqliteAdapter, "batch"> => {
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

    function readTable(name: string) {
      const metadata = getTableMetadata(name);
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
    }

    const adapter: Omit<SqliteAdapter, "batch"> = {
      columnExtends: (a, b) =>
        (a === "number" && b === "boolean") ||
        (a === "string" && b === "json"),

      readSchema: () => {
        const tables = client.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='table'
          AND name NOT LIKE 'sqlite_%'
        `).all() as { name: string }[];

        const _tables: Record<string, t.Table> = {};

        for (const row of tables) {
          _tables[String(row.name)] = readTable(String(row.name));
        }

        return t.schema(_tables);
      },

      readTable,

      create: (table, values) => {
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

        const result = client.prepare(executable.sql)
          .all(executable.args) as Array<Record<string, Value>>;

        return result.map(clean);
      },

      read: (table, {
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
        const result = client.prepare(executable.sql)
          .all(executable.args) as Array<Record<string, Value>>;

        return result.map(clean);
      },

      update: (table, { where, set }) => {
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
        const result = client.prepare(executable.sql)
          .all(executable.args) as Array<Record<string, Value>>;

        return result.map(clean);
      },

      delete: (table, { where }) => {
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
        const result = client.prepare(executable.sql)
          .all(executable.args) as Array<Record<string, Value>>;

        return result.map(clean);
      },

      execute: (query, params) => {
        const stmt = prepare(query);
        let result: Array<Record<string, Value>>;

        if (params) {
          if (!Array.isArray(params)) {
            // For positional parameters - convert to proper type
            result = stmt.all(params) as Array<Record<string, Value>>;
          } else {
            // For named parameters
            result = stmt.all(...params) as Array<Record<string, Value>>;
          }
        } else {
          result = stmt.all() as Array<Record<string, Value>>;
        }

        return result.map(clean);
      },
    };

    return adapter;
  };

  const adapter = createAdapter(client);
  adapter.read = measure("sqlite.read", adapter.read);
  adapter.execute = measure("sqlite.execute", adapter.execute);

  return {
    ...adapter,
    batch: (fn) => {
      client.exec("BEGIN");
      try {
        const tasks: Array<() => Promise<void> | void> = [];
        fn({
          createTable: (...args) => tasks.push(() => createTable(...args)),
          dropTable: (...args) => tasks.push(() => dropTable(...args)),
          createColumn: (...args) => tasks.push(() => createColumn(...args)),
          dropColumn: (...args) => tasks.push(() => dropColumn(...args)),
          createIndex: (...args) => tasks.push(() => createIndex(...args)),
          dropIndex: (...args) => tasks.push(() => dropIndex(...args)),
        });

        for (const task of tasks) {
          task();
        }
        client.exec("COMMIT");
      } catch (error) {
        client.exec("ROLLBACK");
        throw error;
      }
    },
  };
};
