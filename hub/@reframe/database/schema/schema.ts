import { Table } from "./table.ts";

export interface Schema<
  Tables extends Record<string, Table> = Record<string, Table>,
> {
  tables: Tables;
}

interface SchemaFactory<Tables extends Record<string, Table>>
  extends Schema<Tables> {
}

export const schema = <
  Tables extends Record<string, Table>,
>(tables: Tables): SchemaFactory<Tables> => ({
  tables,
});
