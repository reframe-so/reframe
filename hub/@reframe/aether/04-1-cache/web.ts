import { factory } from "../00-base/factory.ts";
import type { Cache } from "./interface.ts";

export const web = factory(
  class implements Cache {
    #cache: Promise<globalThis.Cache>;
    constructor(name: string) {
      this.#cache = caches.open(name);
    }

    async fetch(input: string | URL | globalThis.Request, init?: RequestInit) {
      const request = new Request(input, init);

      const cached = await this.#cache
        .then((cache) => cache.match(request));

      if (cached) {
        return cached;
      }

      console.log("[fetch]", request.url);
      const response = await fetch(request);

      if (response.ok) {
        await this.#cache
          .then((cache) => cache.put(request, response.clone()));
      }

      return response;
    }
  },
);
