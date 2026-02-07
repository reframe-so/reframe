import * as t from "@reframe/aether/xx-stage/t.ts";

const DB_PATH = "./data/truth.db";

export function createContext() {
  const db = t.db.sqlite({ url: DB_PATH });
  const kv = t.kv.simple(db);
  const blob = t.blob.kv(t.kv.namespace(["blob"], kv));
  const yan = t.yan.yan(t.kv.namespace(["yan"], kv), blob);
  return { db, kv, blob, yan, Blob: t.Blob };
}

export type Context = ReturnType<typeof createContext>;

export async function withContext<T>(
  fn: (ctx: Context) => Promise<T>,
): Promise<T> {
  const ctx = createContext();
  await ctx.kv().$sync();
  return fn(ctx);
}

// Normalize org slug - strip @ prefix if present
export function normalizeOrg(slug: string): string {
  return slug.startsWith("@") ? slug.slice(1) : slug;
}

// Validate slug format (org, app, branch names)
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateSlug(slug: string, type: string): void {
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      `Invalid ${type} slug: "${slug}". Must be lowercase alphanumeric with optional hyphens.`,
    );
  }
}
