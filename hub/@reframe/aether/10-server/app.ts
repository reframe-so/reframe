import * as t from "./t.ts";
import { Server } from "./interface.ts";
import { runtimeCtx } from "../09-evaluator/ctx.ts";
import {
  Cookie,
  deleteCookie,
  getCookies,
  setCookie,
} from "jsr:@std/http/cookie";

import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3";
import { measure } from "../00-base/measure.ts";

const requestCtx = t.context.create((request: Request) => {
  const headers = request.headers;
  const cookies = new Map<string, string>(Object.entries(getCookies(headers)));
  const pending = new Map<string, Omit<Cookie, "name">>();
  const lock = new AbortController();

  return {
    request,
    headers: request.headers,

    cookies: {
      get: (name: string) => cookies.get(name),
      set: (
        name: string,
        value: string,
        options: Omit<Cookie, "name" | "value"> = {},
      ) => {
        if (lock.signal.aborted) {
          throw lock.signal.reason;
        }

        pending.set(name, {
          value,
          path: "/",
          httpOnly: true,
          ...options,
        });
      },
      getAll: () => Object.fromEntries(cookies.entries()),
    },

    serve: async (
      request: Request,
      serve: (request: Request) => Promise<Response>,
    ) => {
      const response = await serve(request);

      if (!(response instanceof Response)) {
        throw t.Surprise.with`not a response: ${response}`;
      }

      if (request.headers.get("upgrade") === "websocket") {
        lock.abort(
          t.Surprise.with`can not write cookies on websocket requests`,
        );
        return response;
      }

      const headers = new Headers(response.headers);

      for (const [name, { value, ...options }] of pending.entries()) {
        if (value === "") {
          deleteCookie(headers, name, { ...options });
        } else {
          setCookie(headers, { name, value, ...options });
        }
      }

      lock.abort(t.Surprise.with`headers are already sent`);

      return new Response(response.body, {
        headers,
        status: response.status,
        statusText: response.statusText,
      });
    },
  };
});

class Cache<Fn extends (...args: any[]) => any> {
  #cache = new Map<string, { value: ReturnType<Fn>; updatedAt: number }>();
  #ttl: number;
  #key: (...args: Parameters<Fn>) => string;
  #value: Fn;

  constructor(
    fn: Fn,
    { key, ttl }: {
      key: (...args: Parameters<Fn>) => string;
      ttl: number;
    },
  ) {
    this.#value = fn;
    this.#key = key;
    this.#ttl = ttl;
  }

  get(...args: Parameters<Fn>): ReturnType<Fn> {
    const key = this.#key(...args);
    const value = this.#cache.get(key);

    if (value && value.updatedAt > Date.now() - this.#ttl) {
      // RIGHT: stale-while-revalidate
      return value.value;
    }

    const result = this.#value(...args);
    this.#cache.set(key, { value: result, updatedAt: Date.now() });
    return result;
  }
}

export const app = t.factory(
  class implements Server {
    #evaluator: t.evaluator.Evaluator;
    #ctx: t.context.Consumer<{
      org: string;
      frame: string;
      branch: string;
      config: t.Hash<t.Config>;
      runtimeServer: string;
    }>;
    #blob: t.blob.BlobStorage;

    constructor(
      evaluator: t.Factory<t.evaluator.Evaluator>,
      _: {
        ctx: t.context.Consumer<{
          org: string;
          frame: string;
          branch: string;
          config: t.Hash<t.Config>;
          runtimeServer: string;
        }>;
        blob: t.Factory<t.blob.BlobStorage>;
      },
    ) {
      this.#evaluator = evaluator();
      this.#ctx = _.ctx;
      this.#blob = _.blob();
    }

    #runtimeCache = new Cache(
      async (
        ctx: {
          org: string;
          frame: string;
          branch: string;
          config: t.Hash<t.Config>;
          runtimeServer: string;
        },
      ) => {
        const response = await fetch(
          `${ctx.runtimeServer}/graph/@${ctx.org}/${ctx.frame}/${ctx.branch}/${ctx.config}`,
        );

        if (!response.ok) {
          throw response;
        }

        const serializedGraph = await response.text();
        const graph = JSON.parse(serializedGraph) as t.linker.Graph;

        const runtime = this.#evaluator.runtime(
          graph,
          new Map([
            ["/yan", {
              yan: null,
              branch: [ctx.org, ctx.frame, ctx.branch],
            }],
            ["/ctx", {
              ...ctx,
              Surprise: t.Surprise,
              Specifier: t.Specifier,
              blob: this.#blob,
              yan: null,
              runtime: runtimeCtx,
              env: {},
              db: t.db,
              shapes: t.shapes,
              tracer: t.tracer,
              measure: measure,
              S3Client,
              PutObjectCommand,
            }],
            ["/request", {
              request: () => requestCtx.use().request,
              headers: () => requestCtx.use().headers,
              cookies: () => requestCtx.use().cookies,
            }],
          ]),
        );

        return { ...runtime, serializedGraph };
      },
      {
        key: ({ org, frame, branch, config }) =>
          `${org}/${frame}/${branch}/${config}`,
        ttl: 100,
      },
    );

    fetch(request: Request): Promise<Response> {
      return t.tracer.trace("fetch", async () => {
        const url = new URL(request.url);

        // skip favicons
        if (url.pathname === "/favicon.ico") {
          return new Response(null, { status: 204 });
        }

        const ctx = this.#ctx.use();

        const entry = new t.Specifier("yan", "/~entry.ts", { env: "server" });

        const runtime = await this.#runtimeCache.get(ctx);

        return runtimeCtx.with(runtime, async () => {
          const result = await runtime.import<{
            serve: (request: Request) => Promise<Response>;
          }>("server", entry, "default");

          return requestCtx.with(
            request,
            () => requestCtx.use().serve(request, () => result.serve(request)),
          );
        });
      });
    }
  },
);
