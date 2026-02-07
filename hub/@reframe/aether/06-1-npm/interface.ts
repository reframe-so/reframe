import * as t from "./t.ts";

export interface Registry {
  parse(specifier: string): { name: string; version: string; path: t.Path };
  resolve(name: string, specifier: string): Promise<PackageJson>;
  // RIGHT: return entire tree instead of just the blob
  fetch(target: string, path: t.Path): Promise<t.Blob>;
}

export class NotFoundSurprise extends t.Surprise.extend<{
  specifier: string;
}>(
  "not-found",
  (ctx, _, t) => t`not found: ${ctx.specifier}`,
) {}

export class FetchSurprise extends t.Surprise.extend<{
  url: string;
  status: number;
  statusText: string;
}>(
  "fetch",
  (ctx, _, t) =>
    t`failed to fetch: ${ctx.url} (${ctx.status} - ${ctx.statusText})`,
) {}

export interface PackageJson {
  name: string;
  version: string;
  dependencies: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface Graph {
  version: number;

  dependencies: Record<string, {
    specifier: string;
    // eg. "17.0.2", "!17.0.2(react@17.0.2)"
    version: string;
  }>;

  packages: Record<string, {
    resolve: Record<string, string>;
    versions: Record<string, {
      color: null | number;
      deps: Record<string, string>;
      transitive?: Record<string, Array<string>>;
      // eg. react: ^17.0.2
      peer?: Record<string, string>;
    }>;
  }>;
  snapshots: Record<string, Record<string, string>>;
  staging: Record<
    string,
    Record<string, {
      specifier: string;
      version: null | string;
    }>
  >;
}
