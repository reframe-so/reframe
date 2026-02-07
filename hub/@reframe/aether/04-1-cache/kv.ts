import * as t from "./t.ts";
import type { Cache } from "./interface.ts";

export const kv = t.factory(
  class implements Cache {
    #kv: t.kv.KV;
    constructor(kv: t.Factory<t.kv.KV>) {
      this.#kv = kv();
    }

    async fetch(
      input: string | URL | globalThis.Request,
      init?: RequestInit,
    ) {
      const request = new Request(input, init);

      try {
        const cached = await this.#kv.get<string>([request.url]);
        if (cached.body === null) {
          throw new t.kv.KeyNotFoundSurprise({
            key: [request.url],
          });
        }

        return cached;
      } catch (error) {
        if (!(error instanceof t.kv.KeyNotFoundSurprise)) {
          throw error;
        }
      }

      const response = await fetch(request);

      if (response.ok) {
        const clone = response.clone();
        await this.#kv.set<string>(
          [request.url],
          new t.Blob(clone.body, Object.fromEntries(clone.headers.entries())),
        );
      } else if (response.status === 404) {
        // cache with a ttl?
      }

      return response;
    }
  },
);
