import { Graph, Registry } from "./interface.ts";
import * as t from "./t.ts";
import * as semver from "jsr:@std/semver";
import { SCC } from "../00-base/utils/scc.ts";
import { measure } from "../00-base/measure.ts";

export const splitSpecifier = (specifier: string): [string, string] => {
  if (specifier.startsWith("@")) {
    const [name, version] = splitSpecifier(specifier.slice(1));
    return [`@${name}`, version];
  }

  const [name, ...rest] = specifier.split("@");
  const version = rest.join("@");
  return [name, version];
};

export const getActualVersion = (version: string) => {
  return version.indexOf("(") === -1 ? version : version.split("(")[0];
};

export class PackageManager {
  #graph: Graph;
  #registry: Registry;
  resolverMap: Map<string, Promise<string>> = new Map();
  #dirty = false;

  constructor(
    registry: Registry,
    graph: Graph,
  ) {
    this.#registry = registry;
    this.#graph = graph;
  }

  registry() {
    return this.#registry;
  }

  graph() {
    return this.#graph;
  }

  dirty() {
    return this.#dirty;
  }

  clean() {
    this.#dirty = false;
  }

  checkIntegrity() {
    return {
      peerConflicts: {
        "foo@0.1.0(bar@0.5.0)(baz@0.5.0)": {
          "bar": "<0.4.0",
          "baz": "<0.3.0",
        },
      },
    };
  }

  #satisfiesPeer(version: string, specifier: string) {
    try {
      return semver.satisfies(
        semver.parse(version),
        semver.parseRange(specifier),
      );
    } catch (_) {
      return false;
    }
  }

  /*
    given a name and specifier, eg: react@latest
    resolve the specifier to a version, eg: latest -> 19.0.5
    and download the package json into graph.pacakges
  */
  #downloadSingle(name: string, specifier: string) {
    const resolvedVersion = this.#getResolvedVersion(name, specifier);
    if (resolvedVersion !== null) {
      return resolvedVersion;
    }

    const key = `${name}@${specifier}`;

    if (this.resolverMap.has(key)) {
      return this.resolverMap.get(key)!;
    }

    this.#graph.packages[name] ??= {
      resolve: {},
      versions: {},
    };

    const promise = (async () => {
      const json = await this.#registry.resolve(name, specifier);

      const version = json.version;

      this.#resolvePackage(name, specifier, version);
      // console.log("[>>>>]", name, specifier, version);
      this.resolverMap.delete(key);

      this.#graph.packages[name].versions[version] = {
        color: null,
        deps: Object.fromEntries(
          Object.entries(json.dependencies).filter(([dep]) =>
            !dep.startsWith("@types/")
          ),
        ),
      };

      if (json.peerDependencies) {
        this.#graph.packages[name].versions[version].peer = Object.fromEntries(
          Object.entries(json.peerDependencies).filter(([dep]) =>
            !dep.startsWith("@types/")
          ),
        );
      }

      return version;
    })();

    this.resolverMap.set(key, promise);
    return promise;
  }

  #getUnsatisfiedPeers() {
    return measure.work("npm.getUnsatisfiedPeers", () => {
      const scc = new SCC<string>();

      // Collect all nodes
      for (const [name, { versions }] of Object.entries(this.#graph.packages)) {
        for (const [version, data] of Object.entries(versions)) {
          scc.addNode(`${name}@${version}`);
          data.color = null;
        }
      }

      // Build adjacency map
      for (
        const [aName, { versions }] of Object.entries(this.#graph.packages)
      ) {
        for (const [aVersion, { deps }] of Object.entries(versions)) {
          for (const [bName, spec] of Object.entries(deps)) {
            const bVersion = this.#getResolvedVersion(bName, spec);
            if (!bVersion) {
              // console.log("[UNRESOLVED]", bName, spec);
              throw t.Surprise
                .with`Failed to resolve ${bName}@${spec} for ${aName}@${aVersion} (${
                this.#graph.packages[bName]
              })`;
            }
            scc.addEdge(
              `${aName}@${aVersion}`,
              `${bName}@${bVersion}`,
              "dependsOn",
            );
          }
        }
      }

      scc.build();

      // Assign colors
      for (const [name, { versions }] of Object.entries(this.#graph.packages)) {
        for (const version of Object.keys(versions)) {
          versions[version].color = scc.component(`${name}@${version}`);
        }
      }

      // Group nodes by component
      const condensed = scc.condense();

      // Propagate peer requirements
      const order = Array.from(condensed.keys()).sort((a, b) => a - b);
      const peerMap = new Map<number, Set<string>>();
      for (const id of [...order].reverse()) {
        const component = condensed.get(id)!;
        const peers = peerMap.get(id) ?? new Set();
        peerMap.set(id, peers);

        // for each component
        // first, add all the peers of the nodes in the component
        // then, add all the peers of the downstream components
        // then, remove all the dependencies of the nodes in the component
        // finally, remove the nodes in the component themselves from the set
        // RIGHT: in future, we might need to do a check to determine
        // if the packages in dependencies correctly satisfy the peer requirements

        for (const node of component.nodes) {
          const [pkg, ver] = splitSpecifier(node);
          const peer = this.#graph.packages[pkg].versions[ver].peer ?? {};
          for (const [p, sp] of Object.entries(peer)) {
            peers.add(`${p}@${sp}`);
          }
        }

        for (const to of component.edges) {
          for (const pr of peerMap.get(to) ?? []) {
            peers.add(pr);
          }
        }

        for (const node of component.nodes) {
          const [pkg, version] = splitSpecifier(node);
          for (const pr of peers) {
            const [p, peerSpecifier] = splitSpecifier(pr);
            const depSpecifier =
              this.#graph.packages[pkg].versions[version].deps[p];
            if (!depSpecifier && p !== pkg) {
              continue;
            }

            this.#resolvePackage(
              p,
              peerSpecifier,
              depSpecifier
                ? this.#getResolvedVersion(p, depSpecifier)
                : version,
            );

            peers.delete(pr);
          }
        }
      }

      // Collect unsatisfied peers at roots
      const roots = new Set<number>(order);
      for (const id of order) {
        const component = condensed.get(id)!;
        for (const nb of component.edges) {
          roots.delete(nb);
        }
      }

      const result = new Set<string>();
      for (const id of roots) {
        for (const pr of peerMap.get(id) ?? []) {
          result.add(pr);
        }
      }
      return result;
    });
  }

  #buildTransitiveGraph() {
    return measure.work("npm.buildTransitiveGraph", () => {
      const allTransitives: Map<string, Array<string>> = new Map();

      const order: string[] = [];
      for (const [name, { versions }] of Object.entries(this.#graph.packages)) {
        for (const version of Object.keys(versions)) {
          order.push(`${name}@${version}`);
        }
      }

      order.sort((a, b) => {
        const [nameA, versionA] = splitSpecifier(a);
        const [nameB, versionB] = splitSpecifier(b);
        const colorA = this.#graph.packages[nameA].versions[versionA].color;
        if (colorA === null) {
          throw t.Surprise.with`color not set of ${nameA}@${versionA}`;
        }

        const colorB = this.#graph.packages[nameB].versions[versionB].color;
        if (colorB === null) {
          throw t.Surprise.with`color not set of ${nameB}@${versionB}`;
        }

        return colorB - colorA;
      });

      // build reversed graph
      for (const node of order) {
        const [name, version] = splitSpecifier(node);
        const package_ = this.#graph.packages[name].versions[version];

        for (
          const [dep, specifier] of Object.entries(package_.deps)
        ) {
          const depVersion = this.#getResolvedVersion(dep, specifier);

          if (!depVersion) {
            throw t.Surprise.with`unresolved (1) ${dep}(${specifier})`;
          }

          const dependency = this.#graph.packages[dep].versions[depVersion];

          if (dependency.color === package_.color || !dependency.transitive) {
            continue;
          }

          // QUESTION: how about dependency.peer?
          for (
            const [peer, specifiers] of Object.entries(dependency.transitive)
          ) {
            for (const specifier of specifiers) {
              const key = `${peer}@${specifier}`;
              if (!allTransitives.has(key)) {
                allTransitives.set(key, []);
              }

              allTransitives.get(key)!.push(node);
            }
          }
        }

        const peers = package_.peer ?? {};

        for (const [peer, specifier] of Object.entries(peers)) {
          const peerVersion = this.#getResolvedVersion(peer, specifier);
          if (!peerVersion) {
            throw t.Surprise.with`unresolved (2) ${peer}(${specifier}) (${
              this.#graph.packages[peer]?.resolve
            }) (peer of ${name}@${version})`;
          }

          if (
            this.#graph.packages[peer].versions[peerVersion].color ===
              package_.color
          ) {
            continue;
          }

          const key = `${peer}@${specifier}`;
          if (!allTransitives.has(key)) {
            allTransitives.set(key, []);
          }

          allTransitives.get(key)!.push(node);
        }
      }

      const reversedGraph = new Map<string, string[]>();

      for (const [name, { versions }] of Object.entries(this.#graph.packages)) {
        for (const [version, data] of Object.entries(versions)) {
          const nodeKey = `${name}@${version}`;

          if (!reversedGraph.has(nodeKey)) reversedGraph.set(nodeKey, []);

          const allDeps = data.deps ?? {};

          for (const [depName, specifier] of Object.entries(allDeps)) {
            const resolvedVer = this.#getResolvedVersion(depName, specifier);
            if (!resolvedVer) {
              throw t.Surprise
                .with`Failed to resolve ${depName}@${specifier} for ${nodeKey}`;
            }

            const depKey = `${depName}@${resolvedVer}`;

            // Add normal and reversed edges
            if (!reversedGraph.has(depKey)) reversedGraph.set(depKey, []);
            reversedGraph.get(depKey)!.push(nodeKey);
          }
        }
      }

      for (const [key, sources] of allTransitives) {
        const [name, specifier] = splitSpecifier(key);
        const visited = new Set<string>();

        const queue = sources;

        while (queue.length > 0) {
          // TODO
          // RIGHT: GET RID OF SHIFT()
          const node = queue.shift()!;
          const [packageName, version] = splitSpecifier(node);

          // todo: match specifier with version
          let has = false;
          if (packageName === name) {
            has = true;
          }

          for (
            const dep of Object.keys(
              this.#graph.packages[packageName]?.versions[version].deps,
            )
          ) {
            if (dep === name) {
              has = true;
            }
          }

          if (has) {
            continue;
          }

          visited.add(node);

          for (const from of reversedGraph.get(node) || []) {
            if (visited.has(from)) {
              continue;
            }

            queue.push(from);
          }
        }

        for (const node of visited) {
          const [packageName, version] = splitSpecifier(node);

          const item = this.#graph.packages[packageName]!.versions[version];

          item.transitive ??= {};
          item.transitive[name] ??= [];
          item.transitive[name].push(specifier);
        }
      }

      for (const pkg of Object.values(this.#graph.packages)) {
        for (const version of Object.values(pkg.versions)) {
          if (version.transitive) {
            for (const name of Object.keys(version.transitive)) {
              version.transitive[name] = [...new Set(version.transitive[name])];
            }
          }
        }
      }
    });
  }

  /*
    given a name and specifier, eg: react@latest
    recursively download the package and all its dependencies,
    including any peer dependencies (and their dependencies),
    until all dependencies are downloaded
  */
  #installerMap: Map<string, Promise<string>> = new Map();
  #install(name: string, specifier: string) {
    const key = `${name}@${specifier}`;
    // console.log("[install]", key);
    if (this.#installerMap.has(key)) {
      return this.#installerMap.get(key)!;
    }

    const promise = (async () => {
      const version = await this.#downloadSingle(name, specifier);

      // install all dependencies
      await Promise.all(
        Object.entries(this.#graph.packages[name].versions[version].deps).map(
          ([dep, specifier]) => this.#install(dep, specifier),
        ),
      ).catch(() => {});

      return version;
    })();

    this.#installerMap.set(key, promise);
    return promise;
  }

  #pending = new Map<string, Promise<void>>();
  async #downloadAll(name: string, specifier: string) {
    const key = `${name}@${specifier}`;

    if (!this.#pending.has(key)) {
      this.#pending.set(
        key,
        this.#install(name, specifier).then(() => {
          this.#pending.delete(key);
        }),
      );
    }

    while (this.#pending.size > 0) {
      while (this.#pending.size > 0) {
        await Promise.all(Array.from(this.#pending.values()));
      }

      // console.log(
      //   `================= ${this.#promises.size} =====================`,
      // );

      const unsatisfiedPeers = this.#getUnsatisfiedPeers();
      for (const node of unsatisfiedPeers) {
        const [name, specifier] = splitSpecifier(node);

        if (this.#graph.dependencies[name] !== undefined) {
          const version = this.#graph.dependencies[name].version;

          this.#resolvePackage(name, specifier, version);
          continue;
        }

        // console.log("[PEER]", name, specifier);

        const key = `${name}@${specifier}`;

        if (this.#pending.has(key)) {
          continue;
        }

        this.#pending.set(
          key,
          this.#install(name, specifier).then((version) => {
            this.#pending.delete(key);
            this.#graph.dependencies[name] = {
              specifier,
              version,
            };
          }),
        );
      }
    }
  }

  #snap(
    name: string,
    qualifiedVersion: string,
    resolvedDependencies: Record<string, string>,
  ) {
    const key = `${name}@${qualifiedVersion}`;
    const actualVersion = getActualVersion(qualifiedVersion);

    if (this.#graph.snapshots[key] !== undefined) {
      return;
    }

    if (this.#graph.packages[name].versions[actualVersion] === undefined) {
      throw t.Surprise.with`Failed to resolve ${name}@${actualVersion}`;
    }

    return measure.work("npm.snap", () => {
      const snapshot: Record<string, string> = {};
      resolvedDependencies[name] = qualifiedVersion;

      for (
        const [depName, specifier] of Object.entries(
          this.#graph.packages[name].versions[actualVersion]?.deps,
        )
      ) {
        snapshot[depName] = this.#getQualifiedVersion(
          depName,
          this.#getResolvedVersion(depName, specifier),
          resolvedDependencies,
          Object.fromEntries(
            Object.entries(
              this.#graph.packages[name].versions[actualVersion]?.deps,
            ).map(
              ([dep, specifier]) => [
                dep,
                this.#getResolvedVersion(dep, specifier),
              ],
            ),
          ),
        );
      }

      this.#graph.snapshots[`${name}@${qualifiedVersion}`] = snapshot;

      for (
        const [depName, specifier] of Object.entries(
          this.#graph.packages[name].versions[actualVersion]?.deps,
        )
      ) {
        const depVersion = this.#getResolvedVersion(depName, specifier);
        const newResolvedDependencies: Record<string, string> = {};
        for (
          const [peer, [specifier]] of Object.entries(
            this.#graph.packages[depName]
              .versions[depVersion]?.transitive ?? {},
          )
        ) {
          const resolvedVer = resolvedDependencies[peer];

          if (resolvedVer === undefined) {
            throw t.Surprise.with`unresolved ${peer}(${specifier})`;
          }

          newResolvedDependencies[peer] = resolvedVer;
        }

        this.#snap(depName, snapshot[depName], newResolvedDependencies);
      }
    });
  }

  #getQualifiedVersion(
    name: string,
    version: string,
    resolvedDependencies: Record<string, string>,
    siblings: Record<string, string>,
  ) {
    return measure.work("npm.getQualifiedVersion", () => {
      const array: string[] = [];

      const package_ = this.#graph.packages[name].versions[version];

      if (!package_) {
        throw t.Surprise.with`Failed to resolve ${name}@${version}`;
      }

      for (
        const peerName of Object.keys(package_.transitive ?? {})
      ) {
        if (peerName in resolvedDependencies) {
          array.push(`${peerName}@${resolvedDependencies[peerName]}`);
          continue;
        }

        const sibling = siblings[peerName];

        if (!sibling) {
          throw t.Surprise.with`unresolved ${peerName}(${
            package_.transitive![peerName]
          })`;
        }

        // RIGHT: check if the version satisfies the specifier
        array.push(
          `${peerName}@${
            this.#getQualifiedVersion(
              peerName,
              sibling,
              resolvedDependencies,
              siblings,
            )
          }`,
        );
      }

      array.sort((a, b) => a.localeCompare(b));

      let resolvedVersion = version;

      for (const peer of array) {
        resolvedVersion += `(${peer})`;
      }

      resolvedDependencies[name] = resolvedVersion;

      return resolvedVersion;
    });
  }

  #resolvePackage(name: string, specifier: string, version: string) {
    this.#graph.packages[name].resolve[specifier] = version;
  }

  #getResolvedVersion(name: string, specifier: string) {
    return this.#graph.packages[name]?.resolve[specifier] ?? null;
  }

  async add(name: string, specifier: string) {
    this.#dirty = true;

    if (this.#graph.dependencies[name] !== undefined) {
      // RIGHT: it's already installed
      // we can either throw an error if the installed version
      // does not satisfy the specifier, or we can re-install
      // the package with the new specifier
      this.#resolvePackage(
        name,
        specifier,
        this.#graph.dependencies[name].version,
      );
      await Promise.all(this.#pending.values());
      return;
    }

    await this.#downloadAll(name, specifier);

    this.#graph.dependencies[name] = {
      specifier,
      version: this.#getResolvedVersion(name, specifier),
    };

    this.#buildTransitiveGraph();

    const resolvedDependencies: Record<string, string> = {};
    const snapshot = this.#graph.snapshots["."] ?? {};

    for (
      const [name, { version }] of Object.entries(this.#graph.dependencies)
    ) {
      snapshot[name] = this.#getQualifiedVersion(
        name,
        version,
        resolvedDependencies,
        Object.fromEntries(
          Object.entries(
            this.#graph.dependencies,
          ).map(([dep, { version }]) => [dep, version]),
        ),
      );
    }

    for (const name of Object.keys(this.#graph.dependencies)) {
      this.#snap(name, snapshot[name], resolvedDependencies);
    }

    // console.log("[SNAPSHOT]", snapshot);
    this.#graph.snapshots["."] = snapshot;
  }
}
