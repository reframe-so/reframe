import * as t from "./t.ts";
import { serve as hypervisor } from "./hypervisor.ts";
import { serve as aether } from "./aether.ts";
import { createBundler } from "./bundle.ts";

export const bundler = createBundler();

type ServeConfig =
  | Deno.ServeTcpOptions
  | (Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem);

export const serve = async (
  config: ServeConfig,
  fetch: (request: Request) => Promise<Response>,
) => {
  const { finished } = Deno.serve(config, async (request) => {
    const now = performance.now();

    try {
      const response = await fetch(request);

      if (response instanceof Response) {
        return response;
      }

      throw t.Surprise.with`not a response: ${response}`;
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }

      const response = t.Surprise.from(error).toResponse();

      console.log(
        "[response]",
        request.url,
        response.status,
        Math.round(performance.now() - now),
      );
      return response;
    }
  });

  self.addEventListener("error", (event) => {
    console.log("[Uncaught Error]", t.Surprise.from(event.error).format());
    event.preventDefault();
  });

  self.addEventListener("unhandledrejection", (event) => {
    event.promise.catch((error) =>
      console.log("[Unhandled Rejection]", t.Surprise.from(error).format())
    );
    event.preventDefault();
  });

  const listener = (event: Event) => {
    if (event instanceof CustomEvent) {
      const detail = event.detail as t.TracerEvent;
      if (detail.kind === "span.start") {
        // console.log("[span] [start]", detail.name);
      } else if (detail.kind === "span.end") {
        // console.log("[span] [end]", detail.spanId);
      } else if (detail.kind === "log") {
        console.log("[log]", detail.message);
      }
    }
  };

  t.tracer.addEventListener("event", listener);
  await bundler.bundle();
  await finished;
  t.tracer.removeEventListener("event", listener);
};

if (import.meta.main) {
  await Promise.all([
    hypervisor(),
    aether(),
  ]);
  await bundler.stop();
}
