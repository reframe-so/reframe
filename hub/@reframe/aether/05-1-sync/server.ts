import * as t from "./t.ts";
import { Server, Transfer, TransferItem, PullResult, PushResult } from "./interface.ts";
import { transfer } from "./transfer.ts";

export const server = t.factory(
  class implements Server {
    #yan: t.yan.Yan;
    #blob: t.blob.BlobStorage;
    #transfer: Transfer;

    constructor(
      yan: t.Factory<t.yan.Yan>,
      blob: t.Factory<t.blob.BlobStorage>,
    ) {
      this.#yan = yan();
      this.#blob = blob();
      this.#transfer = transfer(yan, blob)();
    }

    async pull(
      branch: string[],
      clientHead?: t.Hash<t.yan.Commit> | null,
    ): Promise<PullResult & { payload: AsyncIterable<TransferItem> }> {
      const serverHead = await this.#yan.head(branch);

      // Both null - empty branch
      if (!clientHead && !serverHead) {
        return { lca: null, head: null, payload: emptyAsyncIterable() };
      }

      // Compute LCA
      const lca = clientHead ? await this.#yan.lca(clientHead, serverHead!) : null;

      // If client is up to date
      if (lca === serverHead) {
        return { lca, head: serverHead, payload: emptyAsyncIterable() };
      }

      // Return generator directly - no buffering
      return {
        lca,
        head: serverHead,
        payload: this.#transfer.createPayload(serverHead!, lca),
      };
    }

    async push(
      branch: string[],
      expectedHead: t.Hash<t.yan.Commit> | null,
      payload: AsyncIterable<TransferItem>,
    ): Promise<PushResult> {
      const currentHead = await this.#yan.head(branch);

      // Optimistic lock check
      if (currentHead !== expectedHead) {
        return {
          success: false,
          error: "head_mismatch",
          actualHead: currentHead ?? undefined,
        };
      }

      // Pass stream directly - no buffering
      const newHead = await this.#transfer.receivePayload(payload);

      // Update branch
      if (newHead) {
        await this.#yan.push(branch, newHead);
      }

      return { success: true, head: newHead ?? currentHead ?? undefined };
    }
  },
);

// Empty async iterable for empty payloads
async function* emptyAsyncIterable<T>(): AsyncIterable<T> {}

// Binary protocol for streaming transfer items
// Header (for pull): JSON line with { lca, head, commits }
// Each item: type(1) + hashLen(4) + hash + dataLen(4) + data
// Types: 1=blob, 2=tree, 3=commit

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

export async function* decodeTransferStream(
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

export function serve(
  s: Server,
  basePath: string = "",
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const url = new URL(req.url);

    // Strip basePath from pathname
    const pathname = basePath
      ? url.pathname.slice(basePath.length)
      : url.pathname;

    const branch = pathname.split("/").filter(Boolean);
    const head = url.searchParams.get("head") as t.Hash<t.yan.Commit> | null;

    if (req.method === "GET") {
      const result = await s.pull(branch, head);

      const stream = new ReadableStream({
        async start(controller) {
          for await (const item of result.payload) {
            controller.enqueue(encodeTransferItem(item));
          }
          controller.enqueue(new Uint8Array([0])); // End marker
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Sync-LCA": result.lca ?? "",
          "X-Sync-Head": result.head ?? "",
        },
      });
    }

    if (req.method === "POST") {
      // Pass decoded stream directly - no buffering
      const result = await s.push(branch, head, decodeTransferStream(req.body!));
      return Response.json(result);
    }

    return new Response("Method not allowed", { status: 405 });
  };
}
