import * as t from "./t.ts";
import {
  BlobStorage,
  EmptyBlobSurprise,
  MultipleSurprise,
  NotFoundSurprise,
} from "./interface.ts";

/**
 * KV-backed blob storage implementation
 */
export const kv = t.factory(
  class implements BlobStorage {
    #kv: t.kv.KV;

    constructor(kv: t.Factory<t.kv.KV>) {
      this.#kv = kv();
    }

    async write<T>(blob: t.Blob<T>): Promise<t.Hash<T>> {
      const body = blob.body;
      if (!body) {
        throw new EmptyBlobSurprise({});
      }

      const hash = await blob.hash();
      const bytes = await blob.bytes();

      await this.#kv.set(
        ["blobs", hash],
        new t.Blob(bytes, {
          ...blob.metadata,
          [t.kv.XVersion]: null,
        }),
      );

      return hash;
    }

    async read<T>(hash: t.Hash<T>): Promise<t.Blob<T>> {
      try {
        const blob = await this.#kv.get<T>(["blobs", hash]);
        blob.headers.set(t.XBlobHash, hash);
        return blob;
      } catch (error) {
        if (error instanceof t.kv.KeyNotFoundSurprise) {
          throw new NotFoundSurprise({ hash });
        }

        throw error;
      }
    }

    async readMany<T>(hashes: t.Hash<T>[]): Promise<[t.Hash<T>, t.Blob<T>][]> {
      const blobs = await this.#kv.getMany<T>(
        hashes.map((hash) => ["blobs", hash]),
      );
      return blobs.map(([[, hash], blob]) => [hash as t.Hash<T>, blob]);
    }

    async resolve<T>(hash: t.Hash<T>): Promise<t.Hash<T>> {
      const list = await this.#kv.list(
        ["blobs"],
        { after: ["blobs", hash], limit: 2 },
      );

      const matches = list.map(([key]) => key)
        .filter(([, hashKey]) => hashKey?.startsWith(hash));

      if (matches.length === 1) {
        return matches[0][1] as t.Hash<T>;
      }

      if (matches.length === 0) {
        throw new NotFoundSurprise({ hash });
      }

      throw new MultipleSurprise({ hash });
    }
  },
);
