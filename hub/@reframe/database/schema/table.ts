import * as t from "./common.ts";
import { t as s } from "@reframe/shapes/main.ts";

export interface Table<
  Columns extends Record<
    string,
    t.ColumnShape<t.ShapeOf<t.InputValue, unknown>>
  > = Record<
    string,
    t.ColumnShape<t.ShapeOf<t.InputValue, unknown>>
  >,
  Primary extends (keyof Columns & string)[] = (keyof Columns & string)[],
  Unique extends (keyof Columns & string)[][] = (keyof Columns & string)[][],
  Indices extends (keyof Columns & string)[][] = (keyof Columns & string)[][],
> {
  columns: Columns;
  indices: Indices;
  uniqueKeys: Unique;
  primaryKey: Primary;
}

export interface TableFactory<
  Columns extends Record<
    string,
    t.ColumnShape<t.ShapeOf<t.InputValue, unknown>>
  > = Record<
    string,
    t.ColumnShape<t.ShapeOf<t.InputValue, unknown>>
  >,
  Primary extends (keyof Columns & string)[] = (keyof Columns & string)[],
  Unique extends (keyof Columns & string)[][] = (keyof Columns & string)[][],
  Indices extends (keyof Columns & string)[][] = (keyof Columns & string)[][],
> extends Table<Columns, Primary, Unique, Indices> {
  index: <index extends (keyof Columns & string)[]>(
    ...columns: [...index]
  ) => TableFactory<Columns, Primary, Unique, [...Indices, index]>;

  unique: <index extends (keyof Columns & string)[]>(
    ...columns: [...index]
  ) => TableFactory<Columns, Primary, [...Unique, index], Indices>;
}

export const createTable = <
  Columns extends Record<
    string,
    t.ColumnShape<t.ShapeOf<t.InputValue, unknown>>
  >,
  Primary extends (keyof Columns & string)[],
  Unique extends (keyof Columns & string)[][],
  Indices extends (keyof Columns & string)[][],
>(
  columns: Columns,
  indices: [...Indices],
  uniqueKeys: [...Unique],
  primaryKey: Primary,
): TableFactory<Columns, Primary, Unique, Indices> => ({
  columns,
  indices,
  uniqueKeys,
  primaryKey,

  index: (...index) =>
    createTable(
      columns,
      [...indices, index],
      uniqueKeys,
      primaryKey,
    ),

  unique: (...unique) =>
    createTable(
      columns,
      indices,
      [...uniqueKeys, unique],
      primaryKey,
    ),
});

export const table = <
  Columns extends Record<
    string,
    t.ColumnShape<t.ShapeOf<t.InputValue, unknown>>
  >,
>(
  columns: Columns,
) => ({
  primary: <Primary extends (keyof Columns & string)[]>(
    ...primaryKey: Primary
  ) => createTable(columns, [], [], primaryKey),
});
