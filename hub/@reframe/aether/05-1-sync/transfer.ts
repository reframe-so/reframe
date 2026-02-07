import * as t from "./t.ts";
import { Transfer, TransferItem } from "./interface.ts";

export const transfer = t.factory(
  class implements Transfer {
    #yan: t.yan.Yan;
    #blob: t.blob.BlobStorage;

    constructor(
      yan: t.Factory<t.yan.Yan>,
      blob: t.Factory<t.blob.BlobStorage>,
    ) {
      this.#yan = yan();
      this.#blob = blob();
    }

    async *createPayload(
      head: t.Hash<t.yan.Commit>,
      base: t.Hash<t.yan.Commit> | null,
    ): AsyncGenerator<TransferItem> {
      // Step 1: Collect commits from head back to base (exclusive)
      const commits: t.Hash<t.yan.Commit>[] = [];
      let current: t.Hash<t.yan.Commit> | null = head;

      while (current && current !== base) {
        commits.push(current);
        current = await this.#yan.parent(current);
      }

      // Reverse for dependency order (oldest first)
      commits.reverse();

      // Step 2: Initialize sent set with base tree contents (if base exists)
      const sent = new Set<string>();
      if (base) {
        const baseCommit = await this.#yan.commit(base);
        await this.#collectTreeHashes(baseCommit.tree, sent);
      }

      // Step 3: For each commit, yield trees/blobs then commit
      for (const commitHash of commits) {
        const commit = await this.#yan.commit(commitHash);

        // Yield all trees and blobs reachable from this commit's tree
        yield* this.#yieldTree(commit.tree, sent);

        // Yield the commit itself (read raw bytes to preserve hash integrity)
        if (!sent.has(commitHash)) {
          sent.add(commitHash);
          const commitBlob = await this.#blob.read(commitHash);
          yield { type: "commit", hash: commitHash, data: await commitBlob.bytes() };
        }
      }
    }

    // Helper: recursively collect all hashes in a tree (no yielding, just populates sent set)
    async #collectTreeHashes(
      treeHash: t.Hash<t.yan.Tree>,
      sent: Set<string>,
    ): Promise<void> {
      if (sent.has(treeHash)) return;
      sent.add(treeHash);

      const treeBlob = await this.#blob.read(treeHash);
      const tree: t.yan.Tree = JSON.parse(new TextDecoder().decode(await treeBlob.bytes()));

      for (const [_name, node] of Object.entries(tree)) {
        if (node.kind === "blob") {
          sent.add(node.hash);
        } else if (node.kind === "tree") {
          await this.#collectTreeHashes(node.hash, sent);
        }
      }
    }

    async *#yieldTree(
      treeHash: t.Hash<t.yan.Tree>,
      sent: Set<string>,
    ): AsyncGenerator<TransferItem> {
      if (sent.has(treeHash)) return;

      // Read tree (get bytes first, then parse - blob body can only be consumed once)
      const treeBlob = await this.#blob.read(treeHash);
      const treeData = await treeBlob.bytes();
      const tree: t.yan.Tree = JSON.parse(new TextDecoder().decode(treeData));

      // Yield children first (blobs and subtrees)
      for (const [_name, node] of Object.entries(tree)) {
        if (node.kind === "blob") {
          if (!sent.has(node.hash)) {
            sent.add(node.hash);
            const blob = await this.#blob.read(node.hash);
            yield { type: "blob", hash: node.hash, data: await blob.bytes() };
          }
        } else if (node.kind === "tree") {
          yield* this.#yieldTree(node.hash, sent);
        }
      }

      // Yield tree (raw bytes already captured above)
      sent.add(treeHash);
      yield { type: "tree", hash: treeHash, data: treeData };
    }

    async receivePayload(
      items: AsyncIterable<TransferItem>,
    ): Promise<t.Hash<t.yan.Commit> | null> {
      let lastCommit: t.Hash<t.yan.Commit> | null = null;

      for await (const item of items) {
        await this.#blob.write(new t.Blob(item.data as BodyInit));
        if (item.type === "commit") {
          lastCommit = item.hash as t.Hash<t.yan.Commit>;
        }
      }

      return lastCommit;
    }
  },
);
