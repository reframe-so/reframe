import { simple as kv } from "../03-kv/simple.mock.ts";
import { logn as blob } from "../04-blob/logn.mock.ts";
import * as t from "./index.ts";

export const yan = t.yan(kv, blob);
