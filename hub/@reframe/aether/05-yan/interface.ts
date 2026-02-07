import * as t from "./t.ts";
import { WorkingTree } from "./tree.ts";

export class YanSurprise extends t.Surprise.extend<{}>("yan") {}
export class EmptyDirectorySurprise
  extends YanSurprise.extend("empty-directory") {}

export class BranchNotFoundSurprise extends YanSurprise.extend<{
  name: string[];
}>(
  "branch-not-found",
  (ctx, _, t) => t`branch not found ${ctx.name.join("/")}`,
) {}

export class NotFoundSurprise extends YanSurprise.extend<{
  path: t.Path;
  kind?: "tree" | "blob";
}>(
  "not-found",
  (ctx, _, t) => t`${ctx.kind ? `${ctx.kind} ` : ""}not found: ${ctx.path}`,
) {}

export class UnexpectedKindSurprise extends YanSurprise.extend<{
  expected: "tree" | "blob";
  actual: "tree" | "blob";
}>(
  "unexpected-kind",
  (ctx, _, t) => t`unexpected kind: ${ctx.actual} (expected ${ctx.expected})`,
) {}

export class GenesisSurprise extends YanSurprise.extend<{}>(
  "genesis",
) {}

export type MergeStrategy =
  // new commit is a descendent of the current commit
  | "forward"
  // merge the new commit with the current commit
  // give there is no conflict
  | "merge"
  // rebase the new commit on top of the current commit
  | "rebase"
  // merge the new commit even if there is a conflict
  | "force"
  // replace the current commit with the new commit
  | "replace";

export type Node =
  | { kind: "tree"; hash: t.Hash<Tree> }
  | { kind: "blob"; hash: t.Hash<unknown> };

export type Tree = Record<string, Node>;
// RIGHT: no '/' character

export type Change2 = {
  /**
   * b0 x  -> -b0
   * b0 b1 -> -b0 +b1
   * b0 t1 -> -b0 +t1
   * x  b1 -> +b1
   * x  t1 -> +t1
   * t0 x  -> -t0
   * t0 b1 -> -t0 +b1
   * t0 t1 -> recurse
   */
  remove: Record<t.Path, Node>;
  add: Record<t.Path, Node>;
};

export type Change3 = {
  /**
   * -b0       -b0        -> -b0
   * -b0       -b0 +b1    -> -b0 +b1
   * -b0       -b0 +t1    -> -b0 +t1
   * -t0       -t0 +b1    -> -t0 +b1
   *
   * -b0 +b1   -b0 +b2    -> -b0 +(b1,b0,b2) (3-way merge)
   * -t0 +b1   -t0 +b2    -> -t0 +(b1,null,b2) (3-way merge)
   * +b1       +b2        -> +(b1,null,b2) (3-way merge)
   *
   * -b0 +t1   -b0 +t2    -> -b0 (recurse +t1 +t2)
   * +t1       +t2        -> (recurse +t1 +t2)
   *
   * -b0 +b1   -b0 +t2    -> -b0 +(b1,t2) (conflict)
   * +b1       +t1        -> +(b1,t1) (conflict)
   */
  remove: Record<t.Path, Node>;
  add: Record<t.Path, Node>;
  conflict: Record<t.Path, { left: Node; right: Node }>;
};

export interface Commit {
  parent: t.Hash<Commit> | null;
  jump: t.Hash<Commit> | null;
  tree: t.Hash<Tree>;
  depth: number;
  message: string | null;
  timestamp: number;
}

export interface Yan {
  commit(
    head: t.Hash<Commit> | null,
  ): Promise<Commit>;
  write(
    head: t.Hash<Commit> | null,
    files: Record<t.Path, t.Blob<unknown>> | WorkingTree,
    message?: string,
  ): Promise<t.Hash<Commit>>;
  find(
    head: t.Hash<Commit> | null,
    path: t.Path,
  ): Promise<Node>;
  read<T>(
    head: t.Hash<Commit> | null,
    path: t.Path,
  ): Promise<t.Blob<T>>;
  list(
    head: t.Hash<Commit> | null,
    path: t.Path,
  ): Promise<Tree>;

  tree(
    head: t.Hash<Commit>,
  ): Promise<t.Hash<Tree>>;
  parent(
    head: t.Hash<Commit> | null,
  ): Promise<t.Hash<Commit> | null>;
  ancestor(
    head: t.Hash<Commit> | null,
    level?: number,
  ): Promise<t.Hash<Commit> | null>;

  head(name: string | string[]): Promise<t.Hash<Commit> | null>;
  heads(branches: string[][]): Promise<[string[], t.Hash<Commit> | null][]>;

  push(branch: string[], head: t.Hash<Commit>, strategy?: MergeStrategy): Promise<void>;

  revert(branch: string[], ancestor: t.Hash<Commit>): Promise<t.Hash<Commit>>;

  lca(
    left: t.Hash<Commit> | null,
    right: t.Hash<Commit>,
  ): Promise<t.Hash<Commit> | null>;

  // get all branches
  branches(_?: {
    prefix?: string[];
    after?: string[];
    limit?: number;
  }): Promise<[string[], t.Hash<Commit>][]>;

  log(
    head: t.Hash<Commit> | null,
    level?: number,
  ): Promise<{
    hash: t.Hash<Commit>;
    message: string | null;
    timestamp: number;
  }[]>;

  diff(
    left: t.Hash<Commit> | null,
    right: t.Hash<Commit>,
  ): Promise<Change3>;

  apply(
    head: t.Hash<Commit> | null,
    change: Change3,
    message?: string,
  ): Promise<t.Hash<Commit>>;

  workingTree(
    tree: t.Hash<Tree> | null,
  ): WorkingTree;

  // merge the new commit with the current commit
  // push the current branch to the remote
  // push(branch: string[]): Promise<void>;
  // // pull the current branch from the remote
  // pull(branch: Branch, strategy?: MergeStrategy): Promise<Branch>;
}
