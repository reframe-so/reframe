import * as t from "./t.ts";
import { KeyNotFoundSurprise, KV, XVersion } from "./interface.ts";

const SEPARATOR = "#";

export const encodeKey = (key: string[]) => {
  for (let i = 0; i < key.length; i++) {
    const part = key[i];
    for (let j = 0; j < part.length; j++) {
      const charCode = part.charCodeAt(j);
      if (charCode < 36 || charCode > 126) {
        throw t.Surprise
          .with`key part "${part}" contains character with ASCII code ${charCode} outside allowed range 36-126`;
      }
    }
  }

  return SEPARATOR + key.join(SEPARATOR) + SEPARATOR;
};

export const decodeKey = (key: string) => {
  if (
    !key.endsWith(SEPARATOR) ||
    !key.startsWith(SEPARATOR)
  ) {
    throw t.Surprise.with`key ${key} does not end with separator ${SEPARATOR}`;
  }
  if (key === SEPARATOR) {
    return [];
  }

  return key.slice(1, -1).split(SEPARATOR);
};

export const schema = t.db.schema({
  kv: t.db
    .table({
      key: t.db.string(),
      // RIGHT: remove nullable after https://github.com/denoland/deno/issues/28672
      value: t.db.nullable(t.db.blob()),
      version: t.db.number(),
      metadata: t.db.jsonSchema((t) => t.record(t.string(), t.string())),
    })
    .primary("key"),
});

export const simple = t.factory(
  class implements KV {
    #db: t.db.Server<typeof schema>;
    #adapter: t.db.Database;
    constructor(db: t.Factory<t.db.Database>) {
      this.#db = t.db.server(schema, { adapter: db() });
      this.#adapter = db();
    }

    async $sync() {
      await this.#db.$schema.sync();
    }

    #toBlob<T>(row: t.db.Row<typeof schema["tables"]["kv"]>) {
      return new t.Blob<T>(row.value, {
        ...row.metadata,
        [XVersion]: String(row.version),
      });
    }

    async set<T>(key: string[], value: t.Blob<T>) {
      const encodedKey = encodeKey(key);

      const metadata = value.metadata;
      const version = value.metadata[XVersion] === undefined
        ? undefined
        : Number(value.metadata[XVersion]);
      delete metadata[XVersion];

      if (value.body === null) {
        const [row] = await this.#db.kv.delete({
          where: {
            key: encodedKey,
            version,
          },
        });

        if (row) {
          return new t.Blob<T>(null);
        }

        throw new KeyNotFoundSurprise({
          key,
          version,
        });
      }

      const bytes = await value.bytes();

      try {
        if (version !== undefined) {
          throw t.Surprise.with`version ${version} is set, must update`;
        }

        const entry = await this.#db.kv.create({
          key: encodedKey,
          value: bytes,
          version: 1,
          metadata,
        });

        return this.#toBlob<T>(entry);
      } catch (error) {
        const [entry] = await this.#db.kv.update({
          where: {
            key: encodedKey,
            version,
          },
          set: {
            value: bytes,
            version: { $inc: 1 },
            metadata,
          },
        });

        if (entry) {
          return this.#toBlob<T>(entry);
        }

        throw new KeyNotFoundSurprise({
          key,
          version,
        });
      }
    }

    async get<T>(key: string[]) {
      const formattedKey = encodeKey(key);

      const [entry] = await this.#adapter.execute(
        `select * from kv where ( key IS $key ) limit 1`,
        { key: formattedKey },
      );

      if (entry) {
        return this.#toBlob<T>({
          key: entry.key as string,
          value: entry.value as Uint8Array<ArrayBuffer>,
          version: entry.version as number,
          metadata: JSON.parse(entry.metadata as string),
        });
      }

      throw new KeyNotFoundSurprise({ key });
    }

    async getMany<T>(keys: string[][]): Promise<[string[], t.Blob<T>][]> {
      const formattedKeys = keys.map((key) => encodeKey(key));

      const args = formattedKeys.map((key, index) => [`$$${index}`, key]);
      const entries = await this.#adapter.execute(
        `select * from kv where ( key IN (${
          args.map(([key]) => key).join(", ")
        }) )`,
        Object.fromEntries(args),
      );

      const result = entries
        .map((entry) => ({
          key: entry.key as string,
          value: entry.value as Uint8Array<ArrayBuffer>,
          version: entry.version as number,
          metadata: JSON.parse(entry.metadata as string),
        }))
        .map((entry) => {
          return [
            decodeKey(entry.key),
            this.#toBlob(entry),
          ] satisfies [string[], t.Blob<T>];
        });

      return result;
    }

    async list(
      prefix: string[],
      opts: { limit?: number; after?: string[] } = {},
    ) {
      const prefixStr = encodeKey(prefix);
      const afterStr = opts.after ? encodeKey(opts.after) : undefined;

      const entries = await this.#db.kv.read({
        where: {
          key: {
            $like: prefixStr + "%",
            $gt: afterStr,
          },
        },
        limit: opts.limit,
        order: { key: "asc" },
      });

      return entries.map((entry) => {
        return [
          decodeKey(entry.key),
          this.#toBlob(entry),
        ] satisfies [string[], t.Blob<unknown>];
      });
    }
  },
);
