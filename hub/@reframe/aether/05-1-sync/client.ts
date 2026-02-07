import * as t from "./t.ts";
import { Client, PullResult, PushResult, Remotes, RemoteStore, Server, Transfer, TransferItem } from "./interface.ts";
import { transfer } from "./transfer.ts";

/** File-based store for CLI scripts */
export function fileStore(path: string): RemoteStore {
  return {
    read(): Remotes {
      try {
        return JSON.parse(Deno.readTextFileSync(path));
      } catch {
        return {};
      }
    },
    write(remotes: Remotes): void {
      Deno.writeTextFileSync(path, JSON.stringify(remotes, null, 2));
    },
  };
}

/** In-memory store for tests */
export function memoryStore(initial: Remotes = {}): RemoteStore {
  let state = { ...initial };
  return {
    read: () => state,
    write: (remotes) => { state = remotes; },
  };
}

export const client = t.factory(
  class implements Client {
    #yan: t.yan.Yan;
    #blob: t.blob.BlobStorage;
    #store: RemoteStore;
    #refs: Remotes;
    #transfer: Transfer;
    #remotes = new Map<string, Server>();

    constructor(
      yan: t.Factory<t.yan.Yan>,
      blob: t.Factory<t.blob.BlobStorage>,
      store: RemoteStore,
    ) {
      this.#yan = yan();
      this.#blob = blob();
      this.#store = store;
      this.#refs = store.read();
      this.#transfer = transfer(yan, blob)();
    }

    #branchKey(branch: string[]): string {
      return branch.join("/");
    }

    remote = {
      add: async (name: string, server: Server): Promise<void> => {
        this.#remotes.set(name, server);
      },
      remove: async (name: string): Promise<void> => {
        this.#remotes.delete(name);
      },
      list: async (): Promise<Map<string, Server>> => {
        return new Map(this.#remotes);
      },
      head: async (
        remote: string,
        branch: string[],
      ): Promise<t.Hash<t.yan.Commit> | null> => {
        const branchKey = this.#branchKey(branch);
        return this.#refs[remote]?.[branchKey] ?? null;
      },
    };

    async pull(remoteName: string, branch: string[]): Promise<PullResult> {
      const server = this.#remotes.get(remoteName);
      if (!server) {
        throw new Error(`remote not found: ${remoteName}`);
      }

      // Get last known remote head
      const lastHead = await this.remote.head(remoteName, branch);

      // Call server pull
      const result = await server.pull(branch, lastHead);

      // Stream directly to storage - no buffering
      await this.#transfer.receivePayload(result.payload);

      // Update local branch based on relationship with remote
      const localHead = await this.#yan.head(branch);
      if (!localHead && result.head) {
        // First pull - set local branch
        await this.#yan.push(branch, result.head);
      } else if (localHead && result.head && localHead !== result.head) {
        const lca = await this.#yan.lca(localHead, result.head);

        if (lca === localHead) {
          // Local is ancestor of remote - fast forward
          await this.#yan.push(branch, result.head);
        } else if (lca === result.head) {
          // Remote is ancestor of local - nothing to do
          // (local is ahead, will need to push)
        } else {
          // Diverged - rebase local changes on top of remote
          const diff = await this.#yan.diff(result.head, localHead);
          const rebased = await this.#yan.apply(
            result.head,
            diff,
            "rebased commit",
          );
          await this.#yan.push(branch, rebased, "replace");
        }
      }

      // Update remote head tracking
      const branchKey = this.#branchKey(branch);
      if (!this.#refs[remoteName]) {
        this.#refs[remoteName] = {};
      }
      this.#refs[remoteName][branchKey] = result.head;
      this.#store.write(this.#refs);

      return {
        lca: result.lca,
        head: result.head,
      };
    }

    async push(remoteName: string, branch: string[]): Promise<PushResult> {
      const server = this.#remotes.get(remoteName);
      if (!server) throw new Error(`remote not found: ${remoteName}`);

      const localHead = await this.#yan.head(branch);
      const remoteHead = await this.remote.head(remoteName, branch);

      // Nothing to push
      if (localHead === remoteHead) {
        return { success: true, head: localHead ?? undefined };
      }

      // Pass generator directly - no collecting to array
      const payload = localHead
        ? this.#transfer.createPayload(localHead, remoteHead)
        : emptyAsyncIterable();

      // Push to server
      const result = await server.push(branch, remoteHead, payload);

      // Update remote tracking on success
      if (result.success && result.head) {
        const branchKey = this.#branchKey(branch);
        if (!this.#refs[remoteName]) {
          this.#refs[remoteName] = {};
        }
        this.#refs[remoteName][branchKey] = result.head;
        this.#store.write(this.#refs);
      }

      return result;
    }

    async sync(
      remoteName: string,
      branch: string[],
      _message?: string, // Keep for backwards compat but unused (rebase happens in pull)
    ): Promise<{ pulled: PullResult; pushed: PushResult | null; rebased: boolean }> {
      // Pull first (this will rebase if needed)
      const pulled = await this.pull(remoteName, branch);

      const localHead = await this.#yan.head(branch);
      const remoteHead = await this.remote.head(remoteName, branch);

      // Nothing to push
      if (localHead === remoteHead) {
        return { pulled, pushed: null, rebased: false };
      }

      // Push (local is ahead after pull rebased if needed)
      const pushed = await this.push(remoteName, branch);
      return { pulled, pushed, rebased: false }; // Rebase happens in pull now
    }
  },
);

// Empty async iterable for empty payloads
async function* emptyAsyncIterable(): AsyncGenerator<TransferItem> {}

// Binary protocol encoding for transfer items
function encodeTransferItem(item: TransferItem): Uint8Array {
  const encoder = new TextEncoder();
  const hashBytes = encoder.encode(item.hash);

  let type: number;
  if (item.type === "blob") {
    type = 1;
  } else if (item.type === "tree") {
    type = 2;
  } else {
    type = 3;
  }

  const buffer = new Uint8Array(1 + 4 + hashBytes.length + 4 + item.data.length);
  const view = new DataView(buffer.buffer);

  let offset = 0;
  buffer[offset++] = type;
  view.setUint32(offset, hashBytes.length);
  offset += 4;
  buffer.set(hashBytes, offset);
  offset += hashBytes.length;
  view.setUint32(offset, item.data.length);
  offset += 4;
  buffer.set(item.data, offset);

  return buffer;
}

async function* decodeTransferStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<TransferItem> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = new Uint8Array(0);

  const readMore = async () => {
    const { done, value } = await reader.read();
    if (done) return false;
    const newBuffer = new Uint8Array(buffer.length + value.length);
    newBuffer.set(buffer);
    newBuffer.set(value, buffer.length);
    buffer = newBuffer;
    return true;
  };

  while (true) {
    // Need at least 1 byte for type
    while (buffer.length < 1) {
      if (!(await readMore())) return;
    }

    const type = buffer[0];
    if (type === 0) return; // End marker

    // Need type + hashLen
    while (buffer.length < 5) {
      if (!(await readMore())) return;
    }

    const view = new DataView(buffer.buffer, buffer.byteOffset);
    const hashLen = view.getUint32(1);

    // Need type + hashLen + hash + dataLen
    while (buffer.length < 5 + hashLen + 4) {
      if (!(await readMore())) return;
    }

    const dataLen = view.getUint32(5 + hashLen);

    // Need full item
    while (buffer.length < 5 + hashLen + 4 + dataLen) {
      if (!(await readMore())) return;
    }

    const hash = decoder.decode(buffer.slice(5, 5 + hashLen));
    const data = buffer.slice(5 + hashLen + 4, 5 + hashLen + 4 + dataLen);

    // Consume this item
    buffer = buffer.slice(5 + hashLen + 4 + dataLen);

    if (type === 1) {
      yield { type: "blob", hash: hash as t.Hash<unknown>, data };
    } else if (type === 2) {
      yield { type: "tree", hash: hash as t.Hash<unknown>, data };
    } else if (type === 3) {
      yield { type: "commit", hash: hash as t.Hash<unknown>, data };
    }
  }
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export function remote(baseUrl: string, fetchFn: FetchFn = fetch): Server {
  return {
    async pull(branch, head) {
      const url = new URL(branch.join("/"), baseUrl);
      if (head) url.searchParams.set("head", head);

      const res = await fetchFn(url.toString(), { method: "GET" });

      const lca = res.headers.get("X-Sync-LCA") || null;
      const resHead = res.headers.get("X-Sync-Head") || null;

      return {
        lca: lca as t.Hash<t.yan.Commit> | null,
        head: resHead as t.Hash<t.yan.Commit> | null,
        payload: decodeTransferStream(res.body!),
      };
    },

    async push(branch, head, payload: AsyncIterable<TransferItem>) {
      const url = new URL(branch.join("/"), baseUrl);
      if (head) url.searchParams.set("head", head);

      // Convert async iterable to ReadableStream
      const stream = new ReadableStream({
        async start(controller) {
          for await (const item of payload) {
            controller.enqueue(encodeTransferItem(item));
          }
          controller.enqueue(new Uint8Array([0])); // End marker
          controller.close();
        },
      });

      const res = await fetchFn(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: stream,
        duplex: "half", // Required for streaming request body
      } as RequestInit);

      return res.json();
    },
  };
}
