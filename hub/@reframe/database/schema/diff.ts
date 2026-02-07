import { Schema } from "./schema.ts";
import { ColumnHint, ColumnShape, isColumn, Shape } from "./common.ts";

type IndexDiff = {
  columns: string[];
  type: "create";
  unique: boolean;
} | {
  columns: string[];
  type: "drop";
};

type ColumnDiff = {
  type: "create";
  create: CreateColumnPayload;
} | {
  type: "drop";
};

type AlterTablePayload = {
  columns: Record<string, ColumnDiff>;
  indices: IndexDiff[];
};

export type CreateColumnPayload = {
  type: Exclude<ColumnHint, "union" | "null">;
  nullable: boolean;
};

export type CreateTablePayload = {
  columns: Record<string, CreateColumnPayload>;
  primaryKey: string[];
  indices: Array<{
    columns: string[];
    unique: boolean;
  }>;
};

export type TableDiff =
  | { type: "create"; create: CreateTablePayload }
  | { type: "drop" }
  | { type: "alter"; alter: AlterTablePayload };

export interface SchemaDiff {
  tables: Record<string, TableDiff>;
}

const inferColumnType = (column: ColumnShape<Shape>): CreateColumnPayload => {
  const helper = (column: ColumnShape<Shape>): {
    type: Exclude<ColumnHint, "union" | "null"> | null;
    nullable: boolean;
  } => {
    const hint = column.hint();

    if (
      hint === "string" || hint === "number" || hint === "boolean" ||
      hint === "json" || hint === "blob"
    ) {
      return { type: hint, nullable: false };
    }

    if (hint === "null") {
      return { type: null, nullable: true };
    }

    if (hint === "union") {
      const items = Reflect.get(column, "items");
      if (!Array.isArray(items)) {
        throw new Error("union column must have an array of items");
      }

      return items
        .map((item) => {
          if (!isColumn(item)) {
            throw new Error("union item must be a column");
          }

          return helper(item);
        })
        .reduce((acc, item) => {
          if (item.nullable) {
            // if any of the union items is nullable, the union is nullable
            acc.nullable = true;
          }

          if (acc.type === null) {
            acc.type = item.type;
          } else if (acc.type !== item.type && item.type !== null) {
            if (acc.type === "blob" || item.type === "blob") {
              acc.type = "blob";
            } else {
              acc.type = "json";
            }
          }

          return acc;
        });
    }

    throw new Error(`unsupported column hint: ${hint}`);
  };

  const { type, nullable } = helper(column);

  if (type === null) {
    throw new Error("column type cannot be null");
  }

  return { type, nullable };
};

export const diff = (
  left: Schema,
  right: Schema,
  options: {
    extends: (left: ColumnHint, right: ColumnHint) => boolean;
    dropTables?: boolean;
  },
): SchemaDiff => {
  const diff: SchemaDiff = { tables: {} };

  // drop tables
  for (const tableName in left.tables) {
    if (right.tables[tableName] === undefined && options.dropTables) {
      diff.tables[tableName] = { type: "drop" };
    }
  }

  // create tables
  for (const tableName in right.tables) {
    if (left.tables[tableName] === undefined) {
      const table = right.tables[tableName];

      diff.tables[tableName] = {
        type: "create",
        create: {
          columns: {},
          primaryKey: table.primaryKey,
          indices: [
            ...table.indices.map((index) => ({
              columns: index,
              unique: false,
            })),
            ...table.uniqueKeys.map((index) => ({
              columns: index,
              unique: true,
            })),
          ],
        },
      };

      for (const [columnName, column] of Object.entries(table.columns)) {
        diff.tables[tableName].create.columns[columnName] = inferColumnType(
          column,
        );
      }
    }
  }

  // alter tables
  // console.log({
  //   right: Object.keys(right.tables),
  // });
  for (const tableName in right.tables) {
    if (left.tables[tableName] !== undefined) {
      const prev = left.tables[tableName];
      const next = right.tables[tableName];

      if (!next) {
        console.log({ tableName, right });
      }

      const alter: AlterTablePayload = { columns: {}, indices: [] };

      // drop columns
      for (const columnName in prev.columns) {
        if (next.columns[columnName] === undefined) {
          alter.columns[columnName] = { type: "drop" };
        }
      }

      // create columns
      for (const columnName in next.columns) {
        if (prev.columns[columnName] === undefined) {
          alter.columns[columnName] = {
            type: "create",
            create: inferColumnType(next.columns[columnName]),
          };
        }
      }

      // alter columns
      for (const columnName in next.columns) {
        if (prev.columns[columnName] !== undefined) {
          const prevColumn = prev.columns[columnName];
          const nextColumn = next.columns[columnName];

          const prevColumnType = inferColumnType(prevColumn);
          const nextColumnType = inferColumnType(nextColumn);

          if (
            prevColumnType.type !== nextColumnType.type &&
            !options.extends(prevColumnType.type, nextColumnType.type)
          ) {
            throw new Error(
              `${tableName}.${columnName} type changed from ${prevColumnType.type} to ${nextColumnType.type}`,
            );
          }

          if (prevColumnType.nullable !== nextColumnType.nullable) {
            throw new Error(
              `${tableName}.${columnName} nullable changed from ${prevColumnType.nullable} to ${nextColumnType.nullable}`,
            );
          }
        }
      }

      // primary key shouldn't change
      if (prev.primaryKey.join() !== next.primaryKey.join()) {
        throw new Error(
          `${tableName}.primaryKey changed from ${prev.primaryKey.join()} to ${next.primaryKey.join()}`,
        );
      }

      // drop indices
      for (const index of prev.indices) {
        if (!next.indices.some((i) => i.join() === index.join())) {
          // if the index exists as an unique index in the next schema, we will recreate it
          alter.indices.push({ type: "drop", columns: index });
        }
      }

      // drop unique indices
      for (const index of prev.uniqueKeys) {
        if (!next.uniqueKeys.some((i) => i.join() === index.join())) {
          // if the index exists as an index in the next schema, we will recreate it
          alter.indices.push({ type: "drop", columns: index });
        }
      }

      // create indices
      for (const index of next.indices) {
        if (!prev.indices.some((i) => i.join() === index.join())) {
          alter.indices.push({ type: "create", columns: index, unique: false });
        }
      }

      // create unique indices
      for (const index of next.uniqueKeys) {
        if (!prev.uniqueKeys.some((i) => i.join() === index.join())) {
          alter.indices.push({ type: "create", columns: index, unique: true });
        }
      }

      if (Object.keys(alter.columns).length > 0 || alter.indices.length > 0) {
        diff.tables[tableName] = { type: "alter", alter };
      }
    }
  }

  return diff;
};
