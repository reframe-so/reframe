import * as t from "@reframe/aether/xx-stage/t.ts";
import { withContext } from "../context.ts";
import type { Hash, yan } from "@reframe/aether/xx-stage/t.ts";

export async function log(hash: Hash<yan.Commit> | null, limit?: number) {
  return withContext(async ({ yan }) => {
    return await yan().log(hash as t.Hash<t.yan.Commit>, limit ?? 20);
  });
}
