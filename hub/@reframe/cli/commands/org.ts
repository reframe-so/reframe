import { normalizeOrg, validateSlug, withContext } from "../context.ts";

export async function list(): Promise<string[]> {
  return withContext(async ({ yan }) => {
    const branches = await yan().branches();
    return Array.from(new Set(branches.map((branch) => `@${branch[0][0]}`)));
  });
}

export async function create(slug: string): Promise<string> {
  return withContext(async ({ yan, Blob }) => {
    const normalized = normalizeOrg(slug);
    validateSlug(normalized, "org");

    const commit = await yan().write(null, {
      "/readme.md": new Blob(`# ${normalized}`),
    }, "initial commit");

    await yan().push([normalized, "home", "master"], commit);
    return commit;
  });
}
