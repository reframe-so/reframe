import { EmptyDirectorySurprise, NotFoundSurprise, Tree } from "./interface.ts";
import { treeKind } from "./kinds.ts";
import * as t from "./t.ts";

type WorkingNode =
  | (
    & { kind: "blob"; parent: t.Hash<unknown> | null }
    & (
      | {
        blob: null;
        hash: t.Hash<unknown>;
        promise?: Promise<t.Blob<unknown>>;
      }
      | { blob: t.Blob<unknown>; hash: null | t.Hash<unknown> }
    )
  )
  | (
    & { kind: "tree"; parent: t.Hash<Tree> | null }
    & (
      | {
        tree: null;
        hash: t.Hash<Tree>;
        promise?: Promise<Record<string, WorkingNode>>;
      }
      | { tree: Record<string, WorkingNode>; hash: null | t.Hash<Tree> }
    )
  );

export class WorkingTree {
  #blob: t.blob.BlobStorage;
  #root: WorkingNode;

  #pushing:
    | Promise<unknown>
    | null = null;

  constructor(
    blob: t.blob.BlobStorage,
    hash: t.Hash<Tree> | null,
  ) {
    this.#blob = blob;
    this.#root = hash === null
      ? { kind: "tree", hash: null, parent: null, tree: {} }
      : { kind: "tree", hash, parent: null, tree: null };
  }

  async #tree(hash: t.Hash<Tree>) {
    const blob = await this.#blob.read(hash);
    const tree = await treeKind.deserialize(blob);

    const workingTree: Record<string, WorkingNode> = {};

    for (const [key, value] of Object.entries(tree)) {
      if (value.kind === "tree") {
        workingTree[key] = {
          kind: "tree",
          hash: value.hash,
          tree: null,
          parent: null,
        };
      } else {
        workingTree[key] = {
          kind: "blob",
          hash: value.hash,
          blob: null,
          parent: null,
        };
      }
    }

    return workingTree;
  }

  async #pull<T extends WorkingNode>(
    node: T,
  ): Promise<
    T extends { kind: "tree" } ? {
        kind: "tree";
        tree: Record<string, WorkingNode>;
        hash: t.Hash<Tree> | null;
        parent: t.Hash<Tree> | null;
      }
      : T extends { kind: "blob" } ? {
          kind: "blob";
          blob: t.Blob<unknown>;
          hash: t.Hash<unknown> | null;
          parent: t.Hash<unknown> | null;
        }
      : never
  > {
    if (node.kind === "blob") {
      if (node.blob) {
        return node as never;
      }

      if (!node.promise) {
        node.promise = this.#blob.read(node.hash);
      }

      Reflect.set(node, "blob", await node.promise);

      return node as never;
    }

    if (node.tree) {
      return node as never;
    }

    if (!node.promise) {
      node.promise = this.#tree(node.hash);
    }

    Reflect.set(node, "tree", await node.promise);
    return node as never;
  }

  async find(path: t.Path): Promise<WorkingNode> {
    if (path === "/") {
      return this.#root;
    }

    const result = await this.#findTree(t.dirPath(path), { create: false });

    const dir = result.node;
    const name = t.fileName(path);
    if (!dir.tree[name]) {
      throw new NotFoundSurprise({
        path,
      });
    }

    return dir.tree[name];
  }

  async list(path: t.Path): Promise<Record<string, WorkingNode>> {
    const node = await this.find(path);

    if (node.kind !== "tree") {
      throw t.Surprise.with`not a tree: ${node.kind}`;
    }

    const { tree } = await this.#pull(node);

    return tree;
  }

  async read<T>(path: t.Path): Promise<t.Blob<T>> {
    const node = await this.find(path);

    if (node.kind !== "blob") {
      throw t.Surprise.with`not a blob: ${path} ${node.kind}`;
    }

    const { blob } = await this.#pull(node);
    return blob.clone() as t.Blob<T>;
  }

  #dirty(...nodes: WorkingNode[]) {
    for (const node of nodes) {
      node.parent ??= node.hash;
      node.hash = null;
    }
  }

  async #findTree(path: t.Path, opts: { create: boolean }) {
    const parts = t.splitPath(path);
    let current = await this.#pull(this.#root);
    const ancestors = [] as Array<typeof current>;

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];

      if (current.kind !== "tree") {
        throw t.Surprise.with`expected a tree: /${
          parts.slice(0, index).join("/")
        }`;
      }

      if (current.tree[part] === undefined) {
        if (!opts.create) {
          throw new NotFoundSurprise({
            path: t.joinPath("/", ...parts.slice(0, index + 1)),
          });
        }

        // create a new tree
        current.tree[part] = {
          kind: "tree",
          hash: null,
          parent: null,
          tree: {},
        };

        this.#dirty(current, ...ancestors);
      }

      ancestors.push(current);
      current = await this.#pull(current.tree![part]);
    }

    if (current.kind !== "tree") {
      throw t.Surprise.with`expected a tree: /${parts.join("/")}`;
    }

    return { node: current, ancestors };
  }

  async write(path: t.Path, content: t.Blob<unknown>): Promise<void> {
    const name = t.splitPath(path).pop()!;
    const result = await this.#findTree(t.dirPath(path), { create: true });
    const dir = result.node;

    if (dir.tree[name]?.kind === "tree") {
      throw t.Surprise.with`expected a blob: ${path}`;
    }

    const hash = await content.hash?.();

    if (dir.tree[name] !== undefined && dir.tree[name].hash === hash) {
      return;
    }

    // write the content to the tree
    dir.tree[name] ??= {
      kind: "blob",
      blob: content,
      hash: null,
      parent: null,
    };

    if (!content.body) {
      throw t.Surprise.with`blob doesn't have a body: ${path}`;
    }

    dir.tree[name].blob = content;
    this.#dirty(dir.tree[name], dir, ...result.ancestors);
  }

  async delete(path: t.Path): Promise<void> {
    // delete the path from the tree
    const result = await this.#findTree(t.dirPath(path), { create: false });

    const dir = result.node;

    const name = t.splitPath(path).pop()!;

    // delete the path from the tree
    if (dir.tree[name] !== undefined) {
      delete dir.tree[name];
      this.#dirty(dir, ...result.ancestors);
    }
  }

  async #push(node: WorkingNode, path: t.Path): Promise<
    | { kind: "tree"; hash: t.Hash<Tree> }
    | { kind: "blob"; hash: t.Hash<unknown> }
  > {
    if (node.hash !== null) {
      return node.kind === "tree"
        ? { kind: "tree", hash: node.hash }
        : { kind: "blob", hash: node.hash };
    }

    if (node.kind === "blob") {
      if (node.blob === null) {
        throw t.Surprise.with`expected a blob: ${node.kind}`;
      }

      const clone = node.blob.clone();
      node.hash = await this.#blob.write(
        new t.Blob(clone.body, {
          ...clone.metadata,
          parent: node.parent,
        }),
      );
      node.parent = null;

      return { kind: "blob", hash: node.hash };
    }

    if (node.tree === null) {
      throw t.Surprise.with`expected a tree: ${node.kind}`;
    }

    const tree: Tree = {};

    await Promise.all(
      Object.keys(node.tree).map(async (key) => {
        try {
          tree[key] = await this.#push(
            node.tree[key],
            t.joinPath(path, key),
          );
        } catch (e) {
          if (e instanceof EmptyDirectorySurprise) {
            return;
          }

          throw e;
        }
      }),
    );

    if (Object.keys(tree).length === 0) {
      throw new EmptyDirectorySurprise({});
    }

    const blob = await treeKind.serialize(tree, { parent: node.parent });
    node.hash = await this.#blob.write(blob);
    node.parent = null;
    return { kind: "tree", hash: node.hash };
  }

  get fresh(): boolean {
    return this.#root.hash !== null;
  }

  get pushing(): boolean {
    return this.#pushing !== null;
  }

  push(): Promise<t.Hash<Tree>> {
    const promise = this.#pushing
      ? this.#pushing.then(() => this.#push(this.#root, "/"))
      : this.#push(this.#root, "/");

    const chain = promise
      .finally(() => {
        if (this.#pushing === chain) {
          this.#pushing = null;
        }
      });

    this.#pushing = chain;

    return promise.then((node) => {
      if (node.kind !== "tree") {
        throw t.Surprise.with`expected a tree: ${node.kind}`;
      }

      if (node.hash === null) {
        throw t.Surprise.with`expected a hash: ${node.kind}`;
      }

      return node.hash;
    });
  }
}
