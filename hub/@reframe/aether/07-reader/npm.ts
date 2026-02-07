import * as t from "./t.ts";
import { InvalidSpecifierSurprise, Reader, ReframeJson } from "./interface.ts";

export const npm = t.factory(
  class implements Reader {
    #ctx: t.context.Consumer<{
      workingTree: t.yan.WorkingTree;
      packageManager: t.npm.PackageManager;
    }>;
    #yan: t.Factory<t.yan.Yan>;

    constructor(
      _: {
        ctx: t.context.Consumer<{
          workingTree: t.yan.WorkingTree;
          packageManager: t.npm.PackageManager;
        }>;
        yan: t.Factory<t.yan.Yan>;
      },
    ) {
      this.#ctx = _.ctx;
      this.#yan = _.yan;
    }

    async #resolve(
      specifier: string,
      attributes: Record<string, string>,
      importer: t.Specifier,
    ): Promise<t.Specifier> {
      const { workingTree, packageManager } = this.#ctx.use();
      const pkg = packageManager.registry().parse(specifier); // eg: react

      if (specifier.startsWith("npm:") && pkg.version !== "") {
        throw new InvalidSpecifierSurprise({
          specifier,
          attributes,
          importer,
        });
      }

      if (specifier.startsWith("npm:")) {
        await packageManager.add(
          pkg.name,
          ["react", "react-dom", "react-server-dom-webpack"]
              .includes(pkg.name)
            // ? "19.0.0-rc-de68d2f4-20241204"
            // ? "19.2.0-canary-280ff6fe-20250606"
            // ? "19.2.0-canary-12bc60f5-20250613"
            // ? "0.0.0-experimental-12bc60f5-20250613"
            ? "19.3.0-canary-65eec428-20251218"
            : "latest",
        );
      } else if (specifier.startsWith("pac:")) {
        const reframeBlob = await workingTree.read("/reframe.json").catch(
          (e) => {
            if (!(e instanceof t.yan.NotFoundSurprise)) {
              throw e;
            }

            return new t.Blob(JSON.stringify({ dependencies: {} }));
          },
        );
        const reframeJson = await reframeBlob.clone().json() as ReframeJson;
        const version = reframeJson.dependencies[pkg.name.slice(1)] ?? "master";

        // RIGHT:
        await packageManager.add(
          pkg.name,
          version.startsWith("@") ? version.slice(1) : version,
        );
      }

      const graph = packageManager.graph();

      // RIGHT: depends on importer
      if (importer.scheme !== "npm") {
        const snapshot = graph.snapshots["."];

        const version = snapshot[pkg.name];

        if (!version) {
          throw t.Surprise
            .with`${snapshot} has no version of ${pkg.name} (importer: ${importer})`;
        }

        return t.specifier({
          scheme: specifier.slice(0, 3),
          path: `/${pkg.name}@${version}${pkg.path}${
            specifier.startsWith("npm:") ? "~" : ""
          }`,
          attributes: {
            ...importer.attributes,
            ...attributes,
          },
        });
      }

      const parsedImporter = packageManager.registry().parse(
        `${importer.scheme}:${importer.path.slice(1)}`,
      );

      if (parsedImporter.name === pkg.name) {
        // also handle relative paths?
        return t.specifier({
          scheme: "npm",
          path: `/${parsedImporter.name}@${parsedImporter.version}${pkg.path}~`,
          attributes: {
            ...importer.attributes,
            ...attributes,
          },
        });
      }

      const { peers } = t.npm.parsePeerDependencies(parsedImporter.version);

      if (peers[pkg.name]) {
        return t.specifier({
          scheme: "npm",
          path: `/${pkg.name}@${peers[pkg.name]}${pkg.path}~`,
          attributes: {
            ...importer.attributes,
            ...attributes,
          },
        });
      }

      const snapshot =
        graph.snapshots[`${parsedImporter.name}@${parsedImporter.version}`];

      let version = snapshot?.[pkg.name];

      // For type resolution, fall back to root snapshot for @types/* packages
      // since they're typically installed as devDependencies at the root
      if (!version && importer.attributes.env === "type") {
        version = graph.snapshots["."]?.[pkg.name];
      }

      if (!version) {
        if (!snapshot) {
          throw t.Surprise
            .with`failed to find snapshot for ${parsedImporter.name} (imported by ${importer}) in ${graph}`;
        }

        throw t.Surprise
          .with`${pkg.name} is not part of ${snapshot} (imported by ${importer} with peers ${peers}) ([${parsedImporter.name}@${parsedImporter.version}] @ ${graph})`;
      }

      return t.specifier({
        scheme: "npm",
        path: `/${pkg.name}@${version}${pkg.path}~`,
        attributes: {
          ...importer.attributes,
          ...attributes,
        },
      });
    }

    async resolve(
      specifier: string,
      attributes: Record<string, string>,
      importer: t.Specifier,
    ): Promise<t.Specifier> {
      if (
        importer.scheme === "yan" && specifier.startsWith("@") &&
        !specifier.startsWith("@/")
      ) {
        return this.#resolve(`pac:${specifier}`, attributes, importer);
      }

      if (importer.scheme === "pac") {
        if (
          specifier.startsWith("@/") ||
          specifier.startsWith("./") ||
          specifier.startsWith("../") ||
          specifier.startsWith("/") ||
          specifier.startsWith("@")
        ) {
          let path = "";
          if (specifier.startsWith("/")) {
            path = specifier;
          }
          if (specifier.startsWith("./") || specifier.startsWith("../")) {
            path = t.joinPath(
              t.dirPath(`/${importer.path.slice(2)}`),
              specifier,
            );
          }
          if (specifier.startsWith("@/")) {
            const [org, app] = importer.path.slice(2).split("/");

            path = `/${org}/${app}/${specifier.slice(2)}`;
          } else if (specifier.startsWith("@")) {
            path = specifier;
          }
          return this.#resolve(`pac:${path}`, attributes, importer);
        }

        if (specifier.startsWith("npm:")) {
          return this.#resolve(specifier, attributes, importer);
        }

        if (specifier.startsWith("node:")) {
          return new t.Specifier(
            "node",
            `/${specifier.slice("node:".length)}`,
            { ...importer.attributes, ...attributes },
          );
        }
      }

      if (importer.scheme !== "npm") {
        if (specifier.startsWith("lib:")) {
          return new t.Specifier(
            "lib",
            `/${specifier.slice(4)}`,
            { ...importer.attributes, ...attributes },
          );
        }

        if (!specifier.startsWith("npm:")) {
          throw t.Surprise
            .with`can not resolve ${specifier} (${attributes}) from ${importer}`;
        }
        // already has npm:
        return this.#resolve(specifier, attributes, importer);
      }

      if (
        specifier.startsWith("/") ||
        specifier.startsWith("./") ||
        specifier.startsWith("../")
      ) {
        if (specifier.startsWith("/node/")) {
          return new t.Specifier(
            "node",
            `/${
              specifier.slice(...[
                "/node/".length,
                ...(specifier.endsWith(".mjs") ? [-".mjs".length] : []),
              ])
            }`,
            { ...importer.attributes, ...attributes },
          );
        }

        const { env } = { ...importer.attributes, ...attributes };

        if (
          env === "type" &&
          (specifier.endsWith(".d.ts") || specifier.endsWith(".d.mts") ||
            specifier.endsWith(".d.cts"))
        ) {
          // support relative paths for type definitions
          // eg: /foo@version/a/b/c~ + ./bar/baz.d.ts -> /foo@version/a/b/bar/baz~
          const importerDir = t.dirPath(importer.path);
          let relativePath = specifier;
          if (specifier.endsWith(".d.mts")) {
            relativePath = specifier.slice(0, -".d.mts".length);
          } else if (specifier.endsWith(".d.cts")) {
            relativePath = specifier.slice(0, -".d.cts".length);
          } else {
            relativePath = specifier.slice(0, -".d.ts".length);
          }
          const resolvedPath = t.joinPath(importerDir, relativePath);

          return new t.Specifier(
            "npm",
            `${resolvedPath}~`,
            { ...importer.attributes, ...attributes },
          );
        }

        throw t.Surprise
          .with`Relative resolution for specifier '${specifier}' from npm importer '${importer}' is not implemented.`;
      }

      if (specifier.startsWith("node:")) {
        return new t.Specifier(
          "node",
          `/${specifier.slice("node:".length)}`,
          { ...importer.attributes, ...attributes },
        );
      }

      return this.#resolve(`npm:${specifier}`, attributes, importer);
    }

    async read<T>(specifier: t.Specifier): Promise<t.Blob<T>> {
      if (specifier.scheme !== "npm" && specifier.scheme !== "pac") {
        throw t.Surprise.with`can not read ${specifier}`;
      }

      const { workingTree, packageManager } = this.#ctx.use();

      // path looks like /a@1(b@2)(c@3)/(..subpath)
      // parse to get the version

      const pkg = packageManager.registry()
        .parse(
          `${specifier.scheme}:${
            specifier.path.slice(
              ...(
                specifier.scheme === "npm" ? [1, -1] : [2]
              ),
            )
          }`,
        );

      let { version } = t.npm.parsePeerDependencies(pkg.version);

      if (specifier.scheme === "pac") {
        const reframeBlob = await workingTree.read("/reframe.json").catch(
          (e) => {
            if (!(e instanceof t.yan.NotFoundSurprise)) {
              throw e;
            }
            return new t.Blob(JSON.stringify({ dependencies: {} }));
          },
        );

        const reframeJson = await reframeBlob.clone().json() as ReframeJson;

        if (!pkg.name.startsWith("@@")) {
          throw t.Surprise
            .with`invalid pac package name: ${pkg.name} (expected @@)`;
        }

        const [org, app] = pkg.name.slice("@@".length).split("/");
        const branch = reframeJson.dependencies[`@${org}/${app}`] ?? "master";

        const head = await this.#yan().head([
          org,
          app,
          branch.startsWith("@") ? branch.slice(1) : branch,
        ]);

        if (!head) {
          throw new t.yan.BranchNotFoundSurprise({
            name: [org, app, branch],
          });
        }

        version = head.substring(0, 8);
      }

      const ctx = this.#ctx.use();
      const path =
        `/~/${specifier.scheme}/${specifier.attributes.env}/${pkg.name}@${version}${pkg.path}${
          specifier.scheme === "npm" ? "~" : ""
        }` as const;

      try {
        const blob = await ctx.workingTree.read(path);

        return blob as t.Blob<T>;
      } catch (e) {
        if (!(e instanceof t.yan.NotFoundSurprise)) {
          throw e;
        }

        const response = await packageManager.registry().fetch(
          specifier.attributes.env,
          // RIGHT: fix this so we don't include peer in the path
          // get the right path from graph.packages
          // specifier.path,
          `/${pkg.name}@${version}${pkg.path}${
            specifier.scheme === "npm" ? "~" : ""
          }`,
        ).catch((e) => {
          // print the path
          // console.log(`[npm] ${pkg.name}@${version}${pkg.path}`);
          throw e;
        });

        await ctx.workingTree.write(path, response.clone());

        return response as t.Blob<T>;
      }
    }
  },
);
