import * as t from "./t.ts";
import { sqlite as adapter } from "@reframe/database/adapter/sqlite.ts";

export const sqlite = t.factory(adapter);
