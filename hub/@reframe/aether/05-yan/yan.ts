import * as t from "./t.ts";
import {
  BranchNotFoundSurprise,
  Change3,
  Commit,
  EmptyDirectorySurprise,
  GenesisSurprise,
  MergeStrategy,
  Node,
  NotFoundSurprise,
  Tree,
  UnexpectedKindSurprise,
  Yan,
} from "./interface.ts";
import { commitKind, treeKind } from "./kinds.ts";
import { merge3Diff } from "./diff.ts";
import { WorkingTree } from "./tree.ts";

export const yan = t.factory(
  class implements Yan {
    #kv: t.kv.KV;
    #blob: t.blob.BlobStorage;

    constructor(kv: t.Factory<t.kv.KV>, blob: t.Factory<t.blob.BlobStorage>) {
      this.#kv = kv();
      this.#blob = blob();
    }

    async #resolveCommitByPrefix(
      prefix: string,
    ): Promise<t.Hash<Commit> | null> {
      try {
        const hash = await this.#blob.resolve(prefix as t.Hash<Commit>);

        return hash;
      } catch (error) {
        if (
          error instanceof t.blob.NotFoundSurprise
        ) {
          return null;
        }

        throw error;
      }
    }

    async list(head: t.Hash<Commit> | null, path: t.Path): Promise<Tree> {
      const node = await this.find(head, path);

      if (node.kind !== "tree") {
        throw new t.Surprise(`expected a directory: ${path}`);
      }

      return treeKind.deserialize(await this.#blob.read(node.hash));
    }

    async parent(head: t.Hash<Commit> | null): Promise<t.Hash<Commit> | null> {
      if (!head) {
        return null;
      }

      const metadata = await this.commit(head);

      return metadata.parent;
    }

    async commit(head: t.Hash<Commit> | null) {
      if (!head) {
        throw new GenesisSurprise({});
      }

      const blob = await this.#blob.read(head);
      return commitKind.deserialize(blob);
    }

    async tree(head: t.Hash<Commit>): Promise<t.Hash<Tree>> {
      const metadata = await this.commit(head);
      return metadata.tree;
    }

    async #create(
      hash: t.Hash<Commit> | null,
      tree: t.Hash<Tree>,
      message?: string,
    ) {
      const now = new Date();

      const get = async (
        hash: t.Hash<Commit> | null,
      ): Promise<[t.Hash<Commit> | null, number]> => {
        if (!hash) {
          return [null, 1];
        }

        const parent = await this.commit(hash);

        if (!parent.jump) {
          return [hash, parent.depth + 1];
        }

        const superParent = await this.commit(parent.jump);

        const gap = superParent.depth -
          (superParent.jump ? (await this.commit(superParent.jump)).depth : 0);

        if (gap === parent.depth - superParent.depth) {
          return [superParent.jump, parent.depth + 1];
        }

        return [hash, parent.depth + 1];
      };

      const [jump, depth] = await get(hash);

      return this.#blob.write(
        await commitKind.serialize({
          parent: hash,
          tree,
          jump,
          depth,
          message: message ?? null,
          timestamp: now.getTime(),
        }),
      );
    }

    async write(
      head: t.Hash<Commit> | null,
      change: Record<t.Path, t.Blob<unknown>> | WorkingTree,
      message?: string,
    ): Promise<t.Hash<Commit>> {
      if (change instanceof WorkingTree) {
        const hash = await change.push();
        return this.#create(head, hash, message);
      }

      const tree = head ? await this.tree(head) : null;

      const workingTree = this.workingTree(tree);

      for (const [path, content] of Object.entries(change)) {
        if (content.body === null) {
          await workingTree.delete(path as t.Path);
        } else {
          await workingTree.write(path as t.Path, content);
        }
      }

      return this.write(head, workingTree, message);
    }

    async find(
      head: t.Hash<Commit> | null,
      path: t.Path,
    ): Promise<Node> {
      if (!head) {
        throw new NotFoundSurprise({ path });
      }

      const tree = await this.tree(head);
      const parts = t.splitPath(path);
      const file = parts.pop();

      if (!file) {
        return { kind: "tree", hash: tree };
      }

      let node = tree;

      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        const children = await treeKind.deserialize(
          await this.#blob.read(node),
        );

        if (!children[part]) {
          throw new NotFoundSurprise({
            kind: "tree",
            path: t.joinPath("/", ...parts.slice(0, index + 1)),
          });
        }

        if (children[part].kind !== "tree") {
          throw new t.Surprise(
            `expected a directory: /${
              parts.slice(0, index + 1).join("/")
            }, when looking for ${path}`,
          );
        }

        node = children[part].hash;
      }

      const children = await treeKind.deserialize(await this.#blob.read(node));

      if (!children[file]) {
        throw new NotFoundSurprise({ path });
      }

      return children[file];
    }

    async read<T>(
      head: t.Hash<Commit> | null,
      path: t.Path,
    ): Promise<t.Blob<T>> {
      const node = await this.find(head, path);

      if (node.kind === "tree") {
        throw new UnexpectedKindSurprise({
          expected: "blob",
          actual: "tree",
        });
      }

      return this.#blob.read(node.hash as t.Hash<T>);
    }
    async lca(
      left: t.Hash<Commit> | null,
      right: t.Hash<Commit>,
    ): Promise<t.Hash<Commit> | null> {
      if (!left || !right) {
        return null;
      }

      if (left === right) {
        return left;
      }

      const leftMetadata = await this.commit(left);
      const rightMetadata = await this.commit(right);

      if (leftMetadata.depth < rightMetadata.depth) {
        return this.lca(right, left);
      }

      const find = async (
        node: t.Hash<Commit>,
        jumps: number,
      ): Promise<t.Hash<Commit> | null> => {
        let [currentHash, current] = [
          node,
          await this.commit(node),
        ];

        while (jumps > 0 && current) {
          if (!current.parent) return null;

          if (current.jump) {
            const [jumpHash, jump] = [
              current.jump,
              await this.commit(current.jump),
            ];

            if (jump.depth >= current.depth - jumps) {
              jumps -= current.depth - jump.depth;
              [currentHash, current] = [jumpHash, jump];
            } else {
              currentHash = current.parent;
              current = await this.commit(current.parent);
              jumps--;
            }
          } else {
            currentHash = current.parent;
            current = await this.commit(current.parent);
            jumps--;
          }
        }
        return current ? currentHash : null;
      };

      let hash1 = await find(
        left,
        leftMetadata.depth - rightMetadata.depth,
      );
      let hash2: t.Hash<Commit> | null = right;

      while (hash1 !== hash2) {
        if (!hash1 || !hash2) {
          return null;
        }

        const object1 = await this.commit(hash1);
        const object2 = await this.commit(hash2);

        if (!object1.jump || !object2.jump || object1.jump === object2.jump) {
          hash1 = object1.parent;
          hash2 = object2.parent;
        } else {
          hash1 = object1.jump;
          hash2 = object2.jump;
        }
      }

      return hash1;
    }

    async branches(
      _?: { prefix?: string[]; after?: string[]; limit?: number },
    ): Promise<[string[], t.Hash<Commit>][]> {
      const entries = await this.#kv.list(
        _?.prefix ? ["branch", ..._?.prefix] : ["branch"],
        {
          after: _?.after ? ["branch", ..._?.after] : undefined,
          limit: _?.limit,
        },
      );

      return Promise.all(entries.map(async ([key, value]) => {
        const hash = await value.text() as t.Hash<Commit>;
        return [key.slice(1), hash];
      }));
    }

    async push(branch: string[], our: t.Hash<Commit>, strategy?: MergeStrategy): Promise<void> {
      // Handle "replace" strategy - skip divergence check
      if (strategy === "replace") {
        try {
          const _blob = await this.#kv.get<t.Hash<Commit>>(["branch", ...branch]);
          await this.#kv.set(["branch", ...branch], new t.Blob(our, _blob.metadata));
        } catch (error) {
          if (error instanceof t.kv.KeyNotFoundSurprise) {
            await this.#kv.set(["branch", ...branch], new t.Blob(our));
            return;
          }
          throw error;
        }
        return;
      }

      if (strategy && strategy !== "forward") {
        throw t.Surprise.with`unsupported push strategy: ${strategy}`;
      }

      try {
        const _blob = await this.#kv.get<t.Hash<Commit>>([
          "branch",
          ...branch,
        ]);

        const their = await _blob.text() as t.Hash<Commit>;

        const lca = await this.lca(their, our);

        if (their === lca) {
          await this.#kv.set(
            ["branch", ...branch],
            new t.Blob(our, _blob.metadata),
          );

          // console.log("[push]", { branch, their, our, lca });

          return;
        }

        throw t.Surprise
          .with`branch ${branch} (@${their}) diverges from ${our} at ${lca}`;
      } catch (error) {
        if (error instanceof t.kv.KeyNotFoundSurprise) {
          await this.#kv.set(
            ["branch", ...branch],
            new t.Blob(our),
          );

          return;
        }

        throw error;
      }
    }

    async revert(
      branch: string[],
      ancestor: t.Hash<Commit>,
    ): Promise<t.Hash<Commit>> {
      const our = await this.head(branch);

      const lca = await this.lca(our, ancestor);

      if (lca !== ancestor) {
        throw t.Surprise
          .with`can not revert ${branch} to ${ancestor} because it diverges from ${lca}`;
      }

      // get the tree at ancestor
      const tree = await this.tree(ancestor);
      // create a new commit at this tree
      const hash = await this.#create(our, tree, `revert: ${ancestor}`);

      // push branch to the new commit
      await this.push(branch, hash);

      return hash;
    }

    async head(name: string | string[]): Promise<t.Hash<Commit> | null> {
      if (typeof name === "string") {
        return await this.#resolveCommitByPrefix(name);
      }

      if (name.length === 0) {
        throw new BranchNotFoundSurprise({ name });
      }

      try {
        const blob = await this.#kv.get<t.Hash<Commit>>([
          "branch",
          ...name,
        ]);
        return await blob.text() as t.Hash<Commit>;
      } catch (error) {
        if (error instanceof t.kv.KeyNotFoundSurprise) {
          // all branch exists, and point to genesis in the beginning
          return null;
        }

        throw error;
      }
    }

    async heads(
      branches: string[][],
    ): Promise<[string[], t.Hash<Commit> | null][]> {
      const entries = await this.#kv.getMany<t.Hash<Commit>>(
        branches.map((name) => ["branch", ...name]),
      );

      const blobMap = new Map<string, t.Blob>();
      for (const [name, blob] of entries) {
        blobMap.set(name.slice(1).join("/"), blob);
      }

      return Promise.all(
        branches.map(
          async (branch): Promise<[string[], t.Hash<Commit> | null]> => {
            const blob = blobMap.get(branch.join("/"));
            if (!blob) return [branch, null];

            const hash = (await blob.text()) as t.Hash<Commit>;
            return [branch, hash];
          },
        ),
      );
    }

    async log(head: t.Hash<Commit> | null, level: number = 1) {
      const commits: Array<{
        hash: t.Hash<Commit>;
        message: string | null;
        timestamp: number;
      }> = [];

      let current = head;

      if (!current) {
        return [];
      }

      for (let i = 0; i < level; i++) {
        const metadata = await this.commit(current);

        commits.push({
          hash: current,
          message: metadata.message,
          timestamp: metadata.timestamp,
        });

        current = metadata.parent;

        if (!current) {
          break;
        }
      }

      return commits;
    }

    async ancestor(
      head: t.Hash<Commit> | null,
      level: number = 1,
    ): Promise<t.Hash<Commit> | null> {
      let current = head;

      for (let i = 0; i < level; i++) {
        if (!current) {
          return null;
        }

        current = await this.parent(current);
      }

      return current;
    }

    async diff(
      left: t.Hash<Commit> | null,
      right: t.Hash<Commit> | null,
    ): Promise<Change3> {
      if (!left || !right) {
        throw t.Surprise.with`commit not found`;
      }

      const lca = await this.lca(left, right);

      const leftTree = await this.tree(left);
      const rightTree = await this.tree(right);
      const lcaTree = lca ? await this.tree(lca) : null;

      const remove: Record<t.Path, Node> = {};
      const add: Record<t.Path, Node> = {};
      const conflict: Record<t.Path, { left: Node; right: Node }> = {};

      const dfs = async (
        path: t.Path | "",
        leftTree: t.Hash<Tree> | null,
        rightTree: t.Hash<Tree> | null,
        lcaTree: t.Hash<Tree> | null,
      ) => {
        const getChildren = async (tree: t.Hash<Tree> | null) => {
          if (!tree) {
            return {};
          }

          return treeKind.deserialize(await this.#blob.read(tree));
        };

        const [leftChildren, rightChildren, lcaChildren] = await Promise.all([
          getChildren(leftTree),
          getChildren(rightTree),
          getChildren(lcaTree),
        ]);

        const all = new Set([
          ...Object.keys(leftChildren),
          ...Object.keys(rightChildren),
          ...Object.keys(lcaChildren),
        ]);

        for (const child of all) {
          const leftNode = leftChildren[child] ?? null;
          const rightNode = rightChildren[child] ?? null;
          const lcaNode = lcaChildren[child] ?? null;

          if (!leftNode && !rightNode && lcaNode) {
            remove[`${path}/${child}`] = lcaNode;
            continue;
          }

          if (leftNode && !rightNode && !lcaNode) {
            add[`${path}/${child}`] = leftNode;
            continue;
          }

          if (!leftNode && rightNode && !lcaNode) {
            add[`${path}/${child}`] = rightNode;
            continue;
          }

          if (leftNode && rightNode && !lcaNode) {
            if (leftNode.kind === "blob" && rightNode.kind === "blob") {
              const leftContent = await this.read(left, `${path}/${child}`);
              const rightContent = await this.read(
                right,
                `${path}/${child}`,
              );
              add[`${path}/${child}`] = {
                kind: "blob",
                hash: await this.#blob.write(
                  new t.Blob(merge3Diff(
                    await leftContent.text(),
                    "",
                    await rightContent.text(),
                  )),
                ),
              };
              continue;
            }

            if (leftNode.kind === "tree" && rightNode.kind === "tree") {
              if (leftNode.hash === rightNode.hash) {
                add[`${path}/${child}`] = leftNode;
                continue;
              }
              await dfs(
                `${path}/${child}`,
                leftNode.hash,
                rightNode.hash,
                null,
              );
              continue;
            }

            conflict[`${path}/${child}`] = { left: leftNode, right: rightNode };
          }

          if (leftNode && !rightNode && lcaNode) {
            if (
              leftNode.kind === lcaNode.kind && leftNode.hash === lcaNode.hash
            ) {
              continue;
            }

            remove[`${path}/${child}`] = lcaNode;
            add[`${path}/${child}`] = leftNode;
          }

          if (!leftNode && rightNode && lcaNode) {
            if (
              rightNode.kind === lcaNode.kind && rightNode.hash === lcaNode.hash
            ) {
              continue;
            }

            remove[`${path}/${child}`] = lcaNode;
            add[`${path}/${child}`] = rightNode;
          }

          if (leftNode && rightNode && lcaNode) {
            if (
              leftNode.kind === lcaNode.kind &&
              leftNode.hash === lcaNode.hash &&
              rightNode.kind === lcaNode.kind && rightNode.hash === lcaNode.hash
            ) {
              continue;
            }

            if (lcaNode.kind === "blob") {
              remove[`${path}/${child}`] = lcaNode;
            }

            if (
              leftNode.hash === rightNode.hash &&
              leftNode.kind === rightNode.kind
            ) {
              add[`${path}/${child}`] = leftNode;
              continue;
            }

            if (leftNode.kind !== rightNode.kind) {
              conflict[`${path}/${child}`] = {
                left: leftNode,
                right: rightNode,
              };
              continue;
            }

            if (leftNode.kind === "blob") {
              const leftContent = await this.read(left, `${path}/${child}`);
              const rightContent = await this.read(
                right,
                `${path}/${child}`,
              );
              const lcaContent = await this.read(
                lca,
                `${path}/${child}`,
              );
              add[`${path}/${child}`] = {
                kind: "blob",
                hash: await this.#blob.write(
                  new t.Blob(merge3Diff(
                    await leftContent.text(),
                    await lcaContent.text(),
                    await rightContent.text(),
                  )),
                ),
              };
              continue;
            }

            await dfs(
              `${path}/${child}`,
              leftNode.hash as t.Hash<Tree>,
              rightNode.hash as t.Hash<Tree>,
              lcaNode.kind === "tree" ? lcaNode.hash : null,
            );
          }
        }
      };

      await dfs(
        ``,
        leftTree,
        rightTree,
        lcaTree,
      );

      return { remove, add, conflict };
    }

    async apply(
      head: t.Hash<Commit> | null,
      change: Change3,
      message?: string,
    ): Promise<t.Hash<Commit>> {
      const group = (
        changes: Change3,
      ): {
        blobs: Record<
          string,
          { add?: Node; remove?: Node; conflict?: { left: Node; right: Node } }
        >;
        trees: Record<string, Change3>;
      } => {
        const blobs: Record<
          string,
          { add?: Node; remove?: Node; conflict?: { left: Node; right: Node } }
        > = {};
        const trees: Record<string, Change3> = {};

        const categorize = <T>(
          entries: Record<string, T>,
          target: keyof Change3,
          wrapper: (
            x: T,
          ) => Partial<
            { add: Node; remove: Node; conflict: { left: Node; right: Node } }
          > = (x) =>
            x as Partial<
              { add: Node; remove: Node; conflict: { left: Node; right: Node } }
            >,
        ) => {
          for (const [path, value] of Object.entries(entries)) {
            const [part, ...rest] = t.splitPath(path);

            if (!part) {
              throw new t.Surprise(`invalid path: ${path}`);
            }

            if (rest.length === 0) {
              blobs[part] = { ...blobs[part], ...wrapper(value) };
            } else {
              trees[part] ??= { remove: {}, add: {}, conflict: {} };
              trees[part] = {
                ...trees[part],
                [target]: {
                  ...trees[part][target],
                  [`/${rest.join("/")}`]: value,
                },
              };
            }
          }
        };

        categorize<Node>(
          changes.remove,
          "remove",
          (node) => ({ remove: node }),
        );
        categorize<Node>(changes.add, "add", (node) => ({ add: node }));
        categorize<{ left: Node; right: Node }>(
          changes.conflict,
          "conflict",
          (node) => ({ conflict: node }),
        );

        return { blobs, trees };
      };

      const dfs = async (tree: t.Hash<Tree> | null, changes: Change3) => {
        const { blobs, trees } = group(changes);
        const children = tree
          ? await treeKind.deserialize(await this.#blob.read(tree))
          : {};

        for (const [path, content] of Object.entries(blobs)) {
          if (content.remove) {
            delete (children[path]);
          }

          if (content.add) {
            children[path] = content.add;
          }

          if (content.conflict) {
            throw new t.Surprise(`conflict: ${path}`);
          }
        }

        for (const [path, files] of Object.entries(trees)) {
          const child = children[path];

          if (child && child.kind !== "tree") {
            throw new t.Surprise(`expected a directory: ${path}`);
          }

          try {
            const hash = await dfs(child ? child.hash : null, files);
            children[path] = { kind: "tree", hash };
          } catch (error) {
            if (error instanceof EmptyDirectorySurprise) {
              delete children[path];
            } else {
              throw error;
            }
          }
        }

        if (Object.keys(children).length === 0) {
          throw new EmptyDirectorySurprise({});
        }

        return await this.#blob.write(
          await treeKind.serialize(children, { parent: tree }),
        );
      };

      const tree = head ? await this.tree(head) : null;
      const newTree = await dfs(tree, change);

      return this.#create(head, newTree, message);
    }

    workingTree(tree: t.Hash<Tree> | null): WorkingTree {
      return new WorkingTree(this.#blob, tree);
    }
  },
);
