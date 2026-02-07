import * as kv from "./index.ts";
import { sqlite } from "../01-database/sqlite.mock.ts";

export const simple = kv.simple(sqlite);
await simple().$sync();
