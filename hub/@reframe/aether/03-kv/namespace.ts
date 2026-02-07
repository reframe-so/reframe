import * as t from "./t.ts";
import { KeyNotFoundSurprise, KV } from "./interface.ts";

export const namespace = t.factory(
  class implements KV {
    #kv: KV;
    #namespace: string[];

    constructor(namespace: string[], kv: t.Factory<KV>) {
      this.#namespace = namespace;
      this.#kv = kv();
    }

    $sync(): Promise<void> | void {
      return this.#kv.$sync();
    }

    #catch(surprise: unknown): never {
      if (surprise instanceof KeyNotFoundSurprise) {
        throw new KeyNotFoundSurprise({
          ...surprise.ctx,
          key: surprise.ctx.key.slice(this.#namespace.length),
        });
      }

      throw surprise;
    }

    set<T>(key: string[], value: t.Blob<T>) {
      return this.#kv.set([...this.#namespace, ...key], value)
        .catch((error) => this.#catch(error));
    }

    get<T>(key: string[]) {
      return this.#kv.get<T>([...this.#namespace, ...key])
        .catch((error) => this.#catch(error));
    }

    async getMany<T>(keys: string[][]) {
      const result = await this.#kv.getMany<T>(
        keys.map((key) => [...this.#namespace, ...key]),
      );

      return result.map(([key, value]) =>
        [
          key.slice(this.#namespace.length),
          value,
        ] satisfies [string[], t.Blob<unknown>]
      );
    }

    async list(prefix: string[], opts?: { limit?: number; after?: string[] }) {
      const result = await this.#kv.list([...this.#namespace, ...prefix], {
        limit: opts?.limit,
        after: opts?.after ? [...this.#namespace, ...opts.after] : undefined,
      });

      return result.map(([key, value]) =>
        [
          key.slice(this.#namespace.length),
          value,
        ] satisfies [string[], t.Blob<unknown>]
      );
    }
  },
);
