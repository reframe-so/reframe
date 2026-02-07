import type * as t from "../sql/index.ts";

type MaybePromise<T> = T | Promise<T>;

export interface Adapter<Value extends t.InputValue> {
  readTable: (table: string) => MaybePromise<t.Table>;
  readSchema: () => MaybePromise<t.Schema>;

  columnExtends: (left: t.ColumnHint, right: t.ColumnHint) => boolean;

  // crud
  create: (
    table: string,
    values: Array<Record<string, Value>>
  ) => MaybePromise<Array<Record<string, Value>>>;

  read: (
    table: string,
    _: {
      where?: Record<string, t.Match<Value> | undefined>;
      order?: Record<string, "asc" | "desc" | undefined>;
      limit?: number;
      offset?: number;
    }
  ) => MaybePromise<Array<Record<string, Value>>>;

  update: (
    table: string,
    _: {
      where: Partial<Record<string, t.Match<Value>>>;
      set: Record<string, Value>;
    }
  ) => MaybePromise<Array<Record<string, Value>>>;

  delete: (
    table: string,
    _: {
      where: Record<string, t.Match<Value>>;
    }
  ) => MaybePromise<Array<Record<string, Value>>>;

  execute: (
    query: string,
    params?: Record<string, Value> | Array<Value>
  ) => MaybePromise<Array<Record<string, Value>>>;

  batch: (
    _: (batch: {
      createTable: (table: string, payload: t.CreateTablePayload) => void;
      dropTable: (table: string) => void;
      createColumn: (
        table: string,
        column: string,
        payload: t.CreateColumnPayload
      ) => void;
      dropColumn: (table: string, column: string) => void;
      createIndex: (table: string, columns: string[], unique: boolean) => void;
      dropIndex: (table: string, columns: string[]) => void;
    }) => void
  ) => MaybePromise<void>;
}
