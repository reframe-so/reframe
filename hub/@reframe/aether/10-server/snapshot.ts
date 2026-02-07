import * as t from "./t.ts";

export type Snapshot = {
  hash: t.Hash<t.yan.Tree>;
  dependencies: Record<
    string,
    string
  >;
  syncDependencies: Record<
    string,
    t.Hash<t.yan.Commit>
  >;
};

export async function createSnapshot(
  yan: t.yan.Yan,
  workingTree: t.yan.WorkingTree,
): Promise<t.Hash<Snapshot>> {
  const getRootHash = async (workingTree: t.yan.WorkingTree) => {
    const node = await workingTree.find("/@");
    if (node.kind === "blob") {
      throw t.Surprise.with`expected a tree: /@`;
    }

    if (node.kind !== "tree") {
      throw t.Surprise.with`expected a tree: /@`;
    }

    // expect hash
    if (node.hash === null) {
      throw t.Surprise.with`expected /@ to be unchanged`;
    }

    return node.hash;
  };

  const [{ dependencies, syncDependencies }, rootHash] = await Promise.all([
    workingTree.read("/reframe.json").then(
      (blob) => blob.json() as Promise<t.reader.ReframeJson>,
      (e) => {
        if (e instanceof t.yan.NotFoundSurprise) {
          return ({ dependencies: {} });
        }

        throw e;
      },
    ).then(async (reframeJson) => {
      const snapshot: Omit<Snapshot, "hash"> = {
        dependencies: {},
        syncDependencies: {},
      };

      const branches = [] as string[][];
      for (
        const [name, branch] of Object.entries(reframeJson.dependencies ?? {})
      ) {
        if (branch.startsWith("@")) {
          const [org, frame] = name.slice(1).split("/");
          branches.push([org, frame, branch.slice(1)]);
        } else {
          snapshot.dependencies[name] = branch;
        }
      }

      const heads = await yan.heads(branches);

      for (const [[org, frame], hash] of heads) {
        if (hash === null) {
          continue;
        }

        snapshot.syncDependencies[`@${org}/${frame}`] = hash;
      }

      snapshot.dependencies = Object.fromEntries(
        Object.entries(snapshot.dependencies)
          .sort(([a], [b]) => a.localeCompare(b)),
      );

      snapshot.syncDependencies = Object.fromEntries(
        Object.entries(snapshot.syncDependencies)
          .sort(([a], [b]) => a.localeCompare(b)),
      );

      return snapshot;
    }),
    getRootHash(workingTree),
  ]);

  return new t.Blob<Snapshot>(JSON.stringify({
    hash: rootHash,
    dependencies,
    syncDependencies,
  })).hash();
}
