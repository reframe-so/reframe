import * as t from "./t.ts";

import { aether } from "./aether-blob.ts";
import { bundler, serve as serve_ } from "./serve.ts";

export const ctx = t.context.create(
  (
    ctx: {
      org: string;
      frame: string;
      branch: string;
      config: t.Hash<t.Config>;
      runtimeServer: string;
    },
  ) => {
    return { bundler, ...ctx };
  },
);

const blob = aether(ctx);
const evaluator = t.evaluator.evaluator(blob);

const app = t.server.app(evaluator, { ctx, blob });

export type Defaults = {
  org: string;
  frame: string;
  branch: string;
};

const defaultDefaults: Defaults = { org: "bootstrap", frame: "hello-world", branch: "master" };

let router: ReturnType<typeof t.server.router> | null = null;

export const serve = (defaults?: Defaults) => {
  const runtimeServerUrl = Deno.env.get("RUNTIME_SERVER_URL") ?? "http://localhost:8001";
  router = t.server.router(ctx, app, runtimeServerUrl, defaults ?? defaultDefaults);

  return serve_(
    Deno.env.get("SSL") === "true"
      ? {
        port: 443,
        cert: Deno.readTextFileSync("./.cache/cert.pem"),
        key: Deno.readTextFileSync("./.cache/key.pem"),
      } as const
      : { port: 8000 },
    (request: Request) => router!().fetch(request),
  );
};

if (import.meta.main) {
  await serve();
}
