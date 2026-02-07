import * as blob from "./index.ts";
import { simple } from "../03-kv/simple.mock.ts";

export const kv = blob.kv(simple);
