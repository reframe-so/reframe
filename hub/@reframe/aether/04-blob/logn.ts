import * as t from "./t.ts";
import {
  BlobStorage,
  MultipleSurprise,
  NotFoundSurprise,
} from "./interface.ts";

/**
 * KV-backed blob storage implementation in O(log n)
 */

const DeltaKind = Symbol("DeltaKind");
const ContentKind = Symbol("ContentKind");
export type Delta<T> = string & {
  [DeltaKind]: T;
};

export type Content<T> = string & {
  [ContentKind]: T;
  _: Body;
};
export interface Pack<T> {
  parent: t.Hash<T> | null;
  depth: number;
  first: t.Hash<T>;
  delta: t.Hash<Delta<T>>[];
}

export const logn = t.factory(
  class implements BlobStorage {
    #kv: t.kv.KV;

    constructor(kv: t.Factory<t.kv.KV>) {
      this.#kv = kv();
    }

    diff<T>(prev: Content<T>, next: Content<T>) {
      const delta = t.diff(prev, next);
      const patches = t.patchMake(prev, delta);
      try {
        return t.patchToText(patches) as Delta<T>;
      } catch (error) {
        throw error;
      }
    }

    applyDelta<T>(content: Content<T>, delta: Delta<T>) {
      const [newContent] = t.patchApply(
        t.patchFromText(delta),
        content,
      );
      return newContent as Content<T>;
    }

    join<T>(first: Content<T>, delta: Delta<T>[]) {
      return delta.reduce(
        (prevPromise, del) => this.applyDelta(prevPromise, del),
        first,
      );
    }

    async writePack<T>(hash: t.Hash<T>, pack: Pack<T>) {
      await this.#kv.set(["packs", hash], new t.Blob(JSON.stringify(pack)));
    }

    async readPack<T>(hash: t.Hash<T>): Promise<Pack<T>> {
      try {
        const result = await this.#kv.get<T>(["packs", hash]);
        return JSON.parse(await result.text()) as Pack<T>;
      } catch (error) {
        if (error instanceof t.kv.KeyNotFoundSurprise) {
          throw new NotFoundSurprise({ hash });
        }

        throw error;
      }
    }

    async writeTyped<T>(type: string, blob: t.Blob<T>): Promise<t.Hash<T>> {
      const body = blob.body;
      if (!body) {
        throw t.Surprise.with`blob has no body`;
      }

      if (blob.bodyUsed) {
        throw t.Surprise.with`blob has been used`;
      }

      const hash = await blob.hash();
      const bytes = await blob.bytes();
      const headers = Object.fromEntries(blob.headers.entries());

      await this.#kv.set([type, hash], new t.Blob(bytes, headers));

      return hash;
    }

    async readTyped<T>(type: string, hash: t.Hash<T>) {
      try {
        return await this.#kv.get<T>([type, hash]);
      } catch (error) {
        if (error instanceof t.kv.KeyNotFoundSurprise) {
          throw new NotFoundSurprise({ hash });
        }

        throw error;
      }
    }

    async readDeltas<T>(hashes: t.Hash<Delta<T>>[]) {
      return await Promise.all(
        hashes.map((hash) => this.readTyped("deltas", hash)),
      );
    }

    async write<T>(blob: t.Blob<T>): Promise<t.Hash<T>> {
      const body = blob.body;
      if (!body) {
        throw t.Surprise.with`blob has no body`;
      }

      if (blob.bodyUsed) {
        throw t.Surprise.with`blob has been used`;
      }

      const hash = await blob.hash();
      const bytes = await blob.bytes();

      const headers = Object.fromEntries(blob.headers.entries());

      if (!headers["parent"]) {
        await this.writePack(hash as t.Hash<T>, {
          parent: null,
          depth: 1,
          first: await this.writeTyped("blobs", new t.Blob(bytes)),
          delta: [],
        });
        return hash;
      }

      const parent = headers["parent"] as t.Hash<T>;
      const prev = await this.readPack(parent);

      if (!prev) {
        throw new Error("not found");
      }

      const bits = (a: number) => {
        let count = 0;
        while (a > 0) {
          count += a & 1;
          a >>= 1;
        }
        return count;
      };

      const depth = prev.depth + 1;
      const commonBits = bits(depth & (depth - 1));

      if (commonBits === 0) {
        await this.writePack(hash as t.Hash<T>, {
          parent,
          depth,
          first: await this.writeTyped("blobs", new t.Blob(bytes)),
          delta: [],
        } as Pack<T>);

        return hash as t.Hash<T>;
      }

      const common = prev.delta.slice(0, commonBits - 1);
      const first = await this.readTyped("blobs", prev.first);
      const deltas = await this.readDeltas(common);

      const commonContent = this.join(
        await first.text() as Content<T>,
        await Promise.all(
          deltas.map(async (delta) => await delta.text() as Delta<T>),
        ),
      );

      const text = new TextDecoder().decode(bytes);
      const delta = this.diff(commonContent, text as Content<T>);

      await this.writePack(hash as t.Hash<T>, {
        parent,
        depth,
        first: prev.first,
        delta: [
          ...common,
          await this.writeTyped("deltas", new t.Blob(delta)),
        ],
      } as Pack<T>);

      await this.#kv.set(["blobs", hash], new t.Blob(bytes, headers));

      return hash as t.Hash<T>;
    }

    async read<T>(hash: t.Hash<T>): Promise<t.Blob<T>> {
      try {
        const pack = await this.readPack(hash);

        if (!pack) {
          throw new Error(`not found: ${hash}`);
        }

        const first = await this.readTyped("blobs", pack.first);
        const deltas = await this.readDeltas(pack.delta);

        const content = this.join(
          await first.text() as Content<T>,
          await Promise.all(
            deltas.map(async (delta) => await delta.text() as Delta<T>),
          ),
        );

        return new t.Blob(content);
      } catch (error) {
        if (error instanceof t.kv.KeyNotFoundSurprise) {
          throw new NotFoundSurprise({ hash });
        }

        throw error;
      }
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

    async readMany<T>(_hashes: t.Hash<T>[]): Promise<[t.Hash<T>, t.Blob<T>][]> {
      throw t.Surprise.with`readMany not implemented in logn storage`;
    }
  },
);
