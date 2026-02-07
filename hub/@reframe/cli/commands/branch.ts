import * as t from "@reframe/aether/xx-stage/t.ts";
import { normalizeOrg, validateSlug, withContext } from "../context.ts";
import type { Hash, Path, yan } from "@reframe/aether/xx-stage/t.ts";

export async function list(
  org: string,
  app: string,
): Promise<readonly [string, string][]> {
  return withContext(async ({ yan }) => {
    const branches = await yan().branches({ prefix: [normalizeOrg(org), app] });
    return branches.map((b) => [b[0][2], b[1]] as const);
  });
}

export async function read(
  org: string,
  app: string,
  branch: string,
): Promise<string | null> {
  return withContext(async ({ yan }) => {
    return await yan().head([normalizeOrg(org), app, branch]);
  });
}

export async function create(
  org: string,
  app: string,
  name: string,
  opts: { commit: string } | { from: string },
): Promise<string> {
  return withContext(async ({ yan }) => {
    const normalized = normalizeOrg(org);
    validateSlug(name, "branch");

    let commit: Hash<yan.Commit>;
    if ("commit" in opts) {
      commit = opts.commit as Hash<yan.Commit>;
    } else {
      const head = await yan().head([normalized, app, opts.from]);
      if (!head) throw new Error(`Branch ${opts.from} not found`);
      commit = head;
    }

    await yan().push([normalized, app, name], commit as t.Hash<t.yan.Commit>);
    return commit;
  });
}

export async function write(
  org: string,
  app: string,
  branch: string,
  files: Record<string, string | null>,
  message: string,
): Promise<string> {
  return withContext(async ({ yan, Blob }) => {
    const normalized = normalizeOrg(org);
    const prev = await yan().head([normalized, app, branch]);

    const fileBlobs: Record<t.Path, t.Blob<unknown>> = {};
    for (const [p, c] of Object.entries(files)) {
      if (c !== null) {
        const path = (p.startsWith("/") ? p : `/${p}`) as t.Path;
        fileBlobs[path] = new Blob(c);
      }
    }

    const head = await yan().write(prev, fileBlobs, message);
    await yan().push([normalized, app, branch], head);
    return head;
  });
}
