import * as kv from "./index.ts";
import { simple } from "./simple.mock.ts";

export const namespace = kv.namespace(["hello", "world"], simple);
await namespace().$sync();
