import * as t from "@reframe/aether/xx-stage/t.ts";
import { withContext } from "../context.ts";
import type { Hash, yan } from "@reframe/aether/xx-stage/t.ts";

export async function read(hash: Hash<yan.Commit> | null) {
  return withContext(async ({ yan }) => {
    return await yan().list(hash as t.Hash<t.yan.Commit>, "/");
  });
}
