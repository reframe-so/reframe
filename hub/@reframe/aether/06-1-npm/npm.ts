import {
  FetchSurprise,
  NotFoundSurprise,
  PackageJson,
  Registry,
} from "./interface.ts";
import * as t from "./t.ts";
import { mapImports } from "./map-imports.ts";

/**
 * Converts a package CDN URL to its corresponding @types/ package URL.
 * The version is dropped since @types/ packages have their own versioning.
 *
 * Examples:
 * - https://esm.sh/json-schema@0.4.0 -> https://esm.sh/@types/json-schema
 * - https://esm.sh/@scope/pkg@1.0.0/subpath -> https://esm.sh/@types/scope__pkg/subpath
 * - https://esm.sh/*json-schema@0.4.0/?target=esnext -> https://esm.sh/*@types/json-schema?target=esnext
 *
 * @param packageUrl - The original package URL
 * @returns The @types/ equivalent URL, or null if the URL can't be parsed
 */
export const toTypesPackageUrl = (packageUrl: string): string | null => {
  try {
    const url = new URL(packageUrl);

    // Match pathname: /pkg@version/... or /@scope/pkg@version/... or /*pkg@version/... or /*@scope/pkg@version/...
    const match = url.pathname.match(
      /^(\/\*?)(@[^/]+\/[^@/]+|[^@/]+)(@[^/]*)(.*)$/,
    );

    if (!match) return null;

    const prefix = match[1]; // "/" or "/*"
    const pkgName = match[2]; // "json-schema" or "@scope/pkg"
    // version is dropped - @types/ package has its own version
    const rest = match[4]; // "/subpath" or ""

    // Convert to @types/ package name
    // foo -> @types/foo
    // @scope/foo -> @types/scope__foo
    const typesPackage = pkgName.startsWith("@")
      ? `@types/${pkgName.slice(1).replace("/", "__")}`
      : `@types/${pkgName}`;

    url.pathname = `${prefix}${typesPackage}${rest}`;
    return url.toString();
  } catch {
    return null;
  }
};

/**
 * Creates a mapper function for transforming import specifiers in type definitions.
 *
 * Handles:
 * - Relative paths (./foo.d.ts, ../bar.d.mts) -> resolved to package subpath
 * - Absolute CDN URLs (https://cdn/pkg@version/path.d.ts) -> pkg/path
 * - Already qualified imports (pkg/foo, pkg) -> unchanged
 *
 * @param cdn - The CDN base URL (e.g., "https://esm-136.fly.dev")
 * @param xTypescriptTypes - The x-typescript-types header value, either absolute URL
 *                           or path like "/@foo/bar@1.2.3/dist/esm/baz.d.ts"
 */
export const createTypeImportMapper = (
  cdn: string,
  xTypescriptTypes: string,
): (specifier: string, attributes: Record<string, string>) => string => {
  const typesUrl = new URL(xTypescriptTypes, cdn);
  const cdnHost = new URL(cdn).host;

  // Match: /@scope/pkg@version/subpath or /pkg@version/subpath
  // Group 1: package name (e.g., "@foo/bar" or "lodash")
  // Group 2: subpath after version (e.g., "dist/esm/baz.d.ts")
  const typesPathMatch = typesUrl.pathname.match(
    /^\/(@[^/]+\/[^@/]+|[^@/]+)@[^/]+\/(.+)$/,
  );

  if (!typesPathMatch) {
    // Fallback: no transformation if we can't parse the types URL
    return (specifier) => specifier;
  }

  const packageName = typesPathMatch[1]; // e.g., "@foo/bar"
  const actualSubpath = typesPathMatch[2]; // e.g., "dist/esm/baz.d.ts"
  // Get directory of the actual file (e.g., "/dist/esm")
  const actualDir = t.dirPath(`/${actualSubpath}`);

  return (specifier: string, _attributes: Record<string, string>): string => {
    // Handle absolute CDN URLs (e.g., "https://esm-136.fly.dev/csstypes@2.3.4/dist/index.d.ts")
    if (
      specifier.startsWith("https://") || specifier.startsWith("http://")
    ) {
      try {
        const url = new URL(specifier);
        // Only transform if it's from our CDN (compare by host to handle http/https)
        if (url.host === cdnHost) {
          // Match: /pkg@version/subpath or /@scope/pkg@version/subpath
          // Group 1: package name
          // Group 2: optional subpath
          const match = url.pathname.match(
            /^\/(@[^/]+\/[^@/]+|[^@/]+)@[^/]+(?:\/(.+))?$/,
          );
          if (match) {
            const pkg = match[1];
            let subpath = match[2] ?? "";
            if (subpath.endsWith(".d.ts")) {
              subpath = subpath.slice(0, -".d.ts".length);
            } else if (subpath.endsWith(".d.mts")) {
              subpath = subpath.slice(0, -".d.mts".length);
            } else if (subpath.endsWith(".d.cts")) {
              subpath = subpath.slice(0, -".d.cts".length);
            }
            return subpath ? `${pkg}/${subpath}` : pkg;
          }
        }
      } catch {
        // Not a valid URL, return as-is
      }
      return specifier;
    }

    // Handle relative paths (e.g., "./internal/types.d.mts" or "../index.d.ts")
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      let relativePath = specifier;
      if (relativePath.endsWith(".d.mts")) {
        relativePath = relativePath.slice(0, -".d.mts".length);
      } else if (relativePath.endsWith(".d.cts")) {
        relativePath = relativePath.slice(0, -".d.cts".length);
      } else if (relativePath.endsWith(".d.ts")) {
        relativePath = relativePath.slice(0, -".d.ts".length);
      }

      // Join the actual directory with the relative path
      const resolvedPath = t.joinPath(actualDir, relativePath);
      return `${packageName}${resolvedPath}`;
    }

    // Already qualified (e.g., "csstypes/foo" or "csstypes") - unchanged
    return specifier;
  };
};

export const parsePeerDependencies = (versionWithPeers: string): {
  version: string;
  peers: Record<string, string>;
} => {
  // eg. "1(a@1)(b@2)"
  // split on the first @, if any, to separate the version from peers
  const separatorIndex = versionWithPeers.indexOf("(");
  if (separatorIndex === -1) {
    return { version: versionWithPeers, peers: {} };
  }

  const version = versionWithPeers.slice(0, separatorIndex);
  const rest = versionWithPeers.slice(separatorIndex);

  const peers = {} as Record<string, string>;

  // (a@1)(b@2)
  for (let i = 0; i < rest.length;) {
    const ch = rest[i];
    // expect ch to be (
    if (ch !== "(") {
      throw t.Surprise.with`invalid peer dependencies: ${versionWithPeers}`;
    }

    i += 1;

    // find the next @
    const nextAt = rest.indexOf("@", i + 1);
    if (nextAt === -1) {
      throw t.Surprise.with`invalid peer dependencies: ${versionWithPeers}`;
    }

    const name = rest.slice(i, nextAt);
    i = nextAt + 1;

    // keep going until depth is 0
    for (let depth = 0; 0 <= depth; i++) {
      if (i >= rest.length) {
        throw t.Surprise.with`invalid peer dependencies: ${versionWithPeers}`;
      }

      const ch = rest[i];
      if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        depth -= 1;
      }
    }

    peers[name] = rest.slice(nextAt + 1, i - 1);
  }

  return { version, peers };
};

const splitVersionAndSubpath = (versionAndSubpath: string): {
  version: string;
  subpath: string;
} => {
  let parenDepth = 0;
  let splitIndex = -1;

  for (let i = 0; i < versionAndSubpath.length; i++) {
    const char = versionAndSubpath[i];
    if (char === "(") {
      parenDepth++;
    } else if (char === ")") {
      parenDepth--;
    } else if (char === "/" && parenDepth === 0) {
      // Found the first '/' outside parentheses
      splitIndex = i;
      break;
    }
  }

  // Check for unbalanced parentheses
  if (parenDepth !== 0) {
    throw t.Surprise
      .with`unbalanced parentheses in version/subpath: ${versionAndSubpath}`;
  }

  if (splitIndex !== -1) {
    // Split occurred
    return {
      version: versionAndSubpath.substring(0, splitIndex),
      subpath: versionAndSubpath.substring(splitIndex + 1),
    };
  } else {
    // No split, entire string is the version
    return { version: versionAndSubpath, subpath: "" };
  }
};

export class NpmRegistry implements Registry {
  #cdn: string;
  #cache: t.cache.Cache;

  constructor(
    _: { cdn: string; cache: t.Factory<t.cache.Cache> },
  ) {
    this.#cdn = _.cdn;
    this.#cache = _.cache();
  }

  /**
   * Fetches type definition source from a response.
   * If content-type is application/typescript, returns the content directly.
   * If content-type is application/javascript, follows x-typescript-types header.
   * Returns { source, typePath } where typePath is used for import mapping.
   */
  async #fetchTypeSource(
    response: Response,
    fallbackTypesUrl: string | null,
  ): Promise<{ source: string; typePath: string | null }> {
    const contentType = response.headers.get("content-type") ?? "";

    // If already TypeScript content, return directly
    if (contentType.includes("application/typescript")) {
      return {
        source: await response.text(),
        typePath: null,
      };
    }

    // Otherwise, look for x-typescript-types header
    let typePath = response.headers.get("x-typescript-types");

    // If no x-typescript-types header, try @types/ package as fallback
    if (!typePath && fallbackTypesUrl) {
      const typesResponse = await this.#cache.fetch(fallbackTypesUrl);

      if (typesResponse.ok) {
        const typesContentType = typesResponse.headers.get("content-type") ??
          "";
        if (typesContentType.includes("application/typescript")) {
          return {
            source: await typesResponse.text(),
            typePath: fallbackTypesUrl,
          };
        }

        typePath = typesResponse.headers.get("x-typescript-types");
      } else if (typesResponse.status === 404) {
        return {
          source: `export {}`,
          typePath: fallbackTypesUrl,
        };
      }
    }

    if (!typePath) {
      throw t.Surprise
        .with`failed to find a type path for ${response.url} on ${fallbackTypesUrl}`;
    }

    const typeUrl = new URL(typePath, this.#cdn);
    typeUrl.protocol = new URL(this.#cdn).protocol;

    const typeResponse = await this.#cache.fetch(typeUrl);

    if (!typeResponse.ok) {
      throw t.Surprise
        .with`failed to fetch ${typePath} (${typeResponse.status} - ${typeResponse.statusText})`;
    }

    return {
      source: await typeResponse.text(),
      typePath,
    };
  }

  parse(specifier: string): { name: string; path: t.Path; version: string } {
    // Regex captures core package name and the rest (starting with @ or /)
    const specifierRegex =
      /^(?<pkgName>(?:@[^@/\s]+\/[^@/\s]+|[^@/\s]+))(?:(?<rest>@.*|\/.*))?$/;
    const match = specifier.match(specifierRegex);

    if (!match || !match.groups?.pkgName) {
      throw t.Surprise.with`invalid specifier format: ${specifier}`;
    }

    const name = match.groups.pkgName;
    const rest = match.groups.rest; // optional: starts with @ or /, or is undefined

    let version = "";
    let subpath = "";

    if (rest?.startsWith("@")) {
      // Use helper to split version and subpath
      const result = splitVersionAndSubpath(rest.substring(1));
      version = result.version;
      subpath = result.subpath;
    } else if (rest?.startsWith("/")) {
      // Only subpath is present (no version)
      subpath = rest.substring(1);
      // version remains ""
    } else if (rest) {
      // Should not be reachable with the regex
      throw t.Surprise
        .with`unexpected format in specifier rest part: ${rest}`;
    }

    // If rest is undefined, version and subpath remain ""

    return { name, version, path: `/${subpath}` };
  }

  async #fetchPackageJson(
    name: string,
    specifier: string,
  ): Promise<PackageJson> {
    try {
      const url = `${this.#cdn}/${name}@${specifier}/package.json`;

      // Perform the fetch.
      const response = await this.#cache.fetch(url);

      if (!response.ok) {
        throw new FetchSurprise({
          url,
          status: response.status,
          statusText: response.statusText,
        });
      }

      // Parse and return the JSON response.
      try {
        const json = t.shapes.object({
          name: t.shapes.literal(name),
          version: t.shapes.string(),
          dependencies: t.shapes.optional(
            t.shapes.record(t.shapes.string(), t.shapes.string()),
          ),
          peerDependencies: t.shapes.optional(
            t.shapes.record(t.shapes.string(), t.shapes.string()),
          ),
        }).read(await response.json());

        return {
          ...json,
          dependencies: json.dependencies ?? {},
        };
      } catch (error) {
        throw t.Surprise
          .with`failed to parse package.json of ${name}@<${specifier}>: ${
          (error as Error).message
        }`;
      }
    } catch (error) {
      if (error instanceof t.Surprise) {
        throw error;
      }

      throw t.Surprise.with`cdn unavailable: ${this.#cdn}: ${
        (error as Error).message
      }`;
    }
  }

  resolve(name: string, specifier: string) {
    return this.#fetchPackageJson(name, specifier);
  }

  async fetch(target: string, path: t.Path): Promise<t.Blob> {
    const url = new URL(`/*${path.slice(1, -1)}`, this.#cdn);

    if (target === "server") {
      url.searchParams.set("conditions", "react-server");
      url.searchParams.set("target", "denonext");
    } else if (target === "client") {
      url.searchParams.set("target", "esnext");
    } else if (target.startsWith("worker:")) {
      url.searchParams.set("target", "esnext");
    } else if (target === "type") {
      url.searchParams.set("target", "esnext");
    } else {
      throw t.Surprise.with`invalid target: ${target} (${path})`;
    }

    const response = await this.#cache.fetch(url);

    if (!response.ok) {
      throw t.Surprise
        .with`failed to fetch ${url.pathname} (${path}) (${response.status} - ${response.statusText}) ${{
        target,
        path,
      }}`;
    }

    if (target === "type") {
      const fallbackTypesUrl = toTypesPackageUrl(url.toString());
      const typeSource = await this.#fetchTypeSource(
        response,
        fallbackTypesUrl,
      );

      const { source, typePath } = typeSource;

      if (!source) {
        throw t.Surprise
          .with`no type path for ${url.pathname} (${path}) ${response.headers}`;
      }

      const mapper = createTypeImportMapper(this.#cdn, typePath ?? url.href);
      // console.log("START", typePath);
      const content = mapImports(source, mapper);
      // console.log("END", typePath);

      return new t.Blob(content);
    }

    const esmPath = response.headers.get("x-esm-path");
    if (!esmPath) {
      throw t.Surprise
        .with`no esm path for ${url.pathname} (${path}) ${response.headers}`;
    }

    const esmResponse = await this.#cache.fetch(
      new URL(esmPath, this.#cdn),
    );

    if (!esmResponse.ok) {
      throw t.Surprise
        .with`failed to fetch ${esmPath} (${esmResponse.status} - ${esmResponse.statusText})`;
    }

    return new t.Blob(
      esmResponse.body,
      Object.fromEntries(esmResponse.headers.entries()),
    );
  }
}

class YanRegistry implements Registry {
  #yan: t.yan.Yan;
  #workingTree: t.yan.WorkingTree;

  constructor(
    _: {
      yan: t.Factory<t.yan.Yan>;
      workingTree: t.yan.WorkingTree;
    },
  ) {
    this.#yan = _.yan();
    this.#workingTree = _.workingTree;
  }

  async #fetchPackageJson(name: string, specifier: string) {
    const [org, app] = name.slice(2).split("/");
    const head = await this.#yan.head([org, app, specifier]);

    if (!head) {
      throw new t.yan.BranchNotFoundSurprise({ name: [org, app, specifier] });
    }

    return {
      name,
      version: head.substring(0, 8),
      dependencies: {},
    };
  }

  parse(specifier: string): {
    name: string;
    version: string;
    path: t.Path;
  } {
    const specifierRegex =
      /^\/?@(?<org>[^/@\s]+)\/(?<app>[^@/\s]+)(?:@(?<commit>[^/\s]+))?(?:\/(?<path>.+))?$/;

    const match = specifier.match(specifierRegex);

    if (!match || !match.groups?.org || !match.groups?.app) {
      throw t.Surprise.with`Invalid specifier: ${specifier}`;
    }

    const org = match.groups.org;
    const path = `/${match.groups.path || ""}` as t.Path;
    let app = "";
    let version = "";
    if (match.groups.app.includes("@")) {
      const appAndVersion = match.groups.app.split("@");
      if (appAndVersion.length > 2) {
        throw t.Surprise
          .with`Invalid app@version format: ${match.groups.app}`;
      }
      app = appAndVersion[0];
      version = appAndVersion[1];
    } else {
      app = match.groups.app;
      version = "";
    }

    return { name: `@@${org}/${app}`, version, path };
  }

  resolve(name: string, specifier: string) {
    return this.#fetchPackageJson(name, specifier);
  }

  async fetch(_target: string, path: t.Path) {
    try {
      if (!path.startsWith("/@@")) {
        throw t.Surprise.with`PAC path must start with "/@@": ${path}`;
      }

      const [, orgWithMarks, appCommit, ...rest] = path.split("/");
      const org = orgWithMarks.slice(2);
      if (!org) throw new Error(`Missing org segment in path: ${path}`);

      const [app] = appCommit.split("@", 2);
      if (!app) throw new Error(`Missing app segment in path: ${path}`);

      const reframeBlob = await this.#workingTree.read("/reframe.json").catch(
        (e) => {
          if (!(e instanceof t.yan.NotFoundSurprise)) {
            throw e;
          }
          return new t.Blob(JSON.stringify({ dependencies: {} }));
        },
      );

      const reframeJson = await reframeBlob.json() as {
        dependencies: Record<string, string>;
      };

      const branch = reframeJson.dependencies[`@${org}/${app}`] ?? "master";

      const theirHead = await this.#yan.head([
        org,
        app,
        branch.startsWith("@") ? branch.slice(1) : branch,
      ]);

      const basePath = `/@/${rest.join("/")}` as const;
      const pathsToTry = [
        basePath,
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}/index.ts`,
        `${basePath}/index.tsx`,
      ] as const;

      // Try each path in order
      for (const pathToTry of pathsToTry) {
        const result = await this.#yan.read(theirHead, pathToTry)
          .catch((e) => {
            if (!(e instanceof t.yan.NotFoundSurprise)) throw e;
            return null;
          });

        if (result) return result;
      }
      throw new NotFoundSurprise({ specifier: path });
    } catch (e) {
      if (!(e instanceof t.yan.NotFoundSurprise)) {
        throw e;
      }

      throw new NotFoundSurprise({ specifier: path });
    }
  }
}

export const npm = t.factory(
  class implements Registry {
    #yanRegistry: Registry;
    #npmRegistry: Registry;
    constructor(_: {
      cdn: string;
      workingTree: t.yan.WorkingTree;
      yan: t.Factory<t.yan.Yan>;
      cache: t.Factory<t.cache.Cache>;
    }) {
      this.#yanRegistry = new YanRegistry({
        yan: _.yan,
        workingTree: _.workingTree,
      });
      this.#npmRegistry = new NpmRegistry({ cdn: _.cdn, cache: _.cache });
    }

    parse(specifier: string): { name: string; version: string; path: t.Path } {
      if (specifier.startsWith("npm:")) {
        return this.#npmRegistry.parse(specifier.slice(4));
      }

      if (specifier.startsWith("pac:")) {
        return this.#yanRegistry.parse(specifier.slice(4));
      }

      throw t.Surprise.with`invalid specifier: ${specifier}`;
    }

    resolve(name: string, specifier: string) {
      if (name.startsWith("@@")) {
        return this.#yanRegistry.resolve(name, specifier);
      }

      return this.#npmRegistry.resolve(name, specifier);
    }

    fetch(target: string, path: t.Path): Promise<t.Blob> {
      if (path.startsWith("/@@")) {
        return this.#yanRegistry.fetch(target, path);
      }

      return this.#npmRegistry.fetch(target, path);
    }
  },
);
