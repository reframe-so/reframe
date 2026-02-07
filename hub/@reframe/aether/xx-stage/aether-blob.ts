import * as t from "./t.ts";
import { BlobStorage } from "../04-blob/interface.ts";

/**
 * Aether-backed blob storage implementation
 */
export const aether = t.factory(
  class implements BlobStorage {
    #ctx: t.context.Consumer<{ runtimeServer: string }>;
    constructor(ctx: t.context.Consumer<{ runtimeServer: string }>) {
      this.#ctx = ctx;
    }

    write<T>(_blob: t.Blob<T>): Promise<t.Hash<T>> {
      throw t.Surprise.with`unimplemented`;
    }

    async read<T>(hash: t.Hash<T>): Promise<t.Blob<T>> {
      const ctx = this.#ctx.use();
      const blob = await fetch(`${ctx.runtimeServer}/b/${hash}`);
      if (!blob.ok) {
        throw new t.Surprise(await blob.text());
      }

      const headers = Object.fromEntries(blob.headers.entries());
      return new t.Blob(blob.body, { ...headers });
    }

    async readMany<T>(_hashes: t.Hash<T>[]): Promise<[t.Hash<T>, t.Blob<T>][]> {
      const ctx = this.#ctx.use();
      const blob = await fetch(`${ctx.runtimeServer}/b`, {
        method: "POST",
        body: JSON.stringify(_hashes),
      });

      if (!blob.ok) {
        throw new t.Surprise(await blob.text());
      }

      const result = await blob.json() as [t.Hash<T>, {
        content: string;
        metadata: Record<string, string>;
      }][];

      return result.map(([hash, { content, metadata }]) => [
        hash,
        new t.Blob(content, { ...metadata }),
      ]);
    }

    resolve<T>(_hash: t.Hash<T>): Promise<t.Hash<T>> {
      throw t.Surprise.with`unimplemented`;
    }
  },
);
