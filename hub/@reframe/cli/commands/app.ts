import { normalizeOrg, validateSlug, withContext } from "../context.ts";

export async function list(org: string): Promise<string[]> {
  return withContext(async ({ yan }) => {
    const branches = await yan().branches({ prefix: [normalizeOrg(org)] });
    return Array.from(new Set(branches.map((b) => b[0][1])));
  });
}

export async function create(org: string, slug: string): Promise<string> {
  return withContext(async ({ yan, Blob }) => {
    const normalized = normalizeOrg(org);
    validateSlug(slug, "app");

    const commit = await yan().write(null, {
      "/readme.md": new Blob(`# ${normalized}/${slug}`),
    }, "initial commit");

    await yan().push([normalized, slug, "master"], commit);
    return commit;
  });
}
