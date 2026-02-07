import "./polyfills/iterator-polyfill.ts";
import type * as t from "./t.ts";

import { evaluator, Importer } from "../09-evaluator/evaluator.ts";
import { Specifier } from "../00-base/specifier.ts";
import { runtimeCtx } from "../09-evaluator/ctx.ts";
import { Surprise } from "@reframe/surprise/index.ts";

console.warn("[time]", performance.now());

class Blob implements t.blob.BlobStorage {
  #cache: Promise<globalThis.Cache> = caches.open("__reframe-1");
  #map = new Map<t.Hash<unknown>, Promise<Response>>();

  async #load(
    hashes: t.Hash<unknown>[],
  ): Promise<Map<t.Hash<unknown>, Response>> {
    const cache = await this.#cache;
    const result = new Map<t.Hash<unknown>, Response>();
    const pending = new Set<t.Hash<unknown>>();

    for (const hash of hashes) {
      const response = await cache.match(`${self.location.origin}/~/b/${hash}`);
      if (response) {
        result.set(hash, response);
      } else {
        pending.add(hash);
      }
    }

    if (pending.size === 0) {
      return result;
    }

    const response = await fetch(`${self.location.origin}/~/b`, {
      method: "POST",
      body: JSON.stringify(Array.from(pending)),
    });

    if (!response.ok) {
      throw new Surprise(await response.text());
    }

    const blobs = await response.json() as [t.Hash<unknown>, {
      content: string;
      metadata: Record<string, string>;
    }][];

    for (const [hash, { content, metadata }] of blobs) {
      const response = new Response(content, { ...metadata });
      result.set(hash, response.clone());
      cache.put(`${self.location.origin}/~/b/${hash}`, response);
    }

    return result;
  }

  readMany<T>(_hashes: t.Hash<T>[]): Promise<[t.Hash<T>, t.Blob<T>][]> {
    const result = new Map<t.Hash<unknown>, Promise<Response>>();

    const pending = new Set<t.Hash<T>>();
    for (const hash of _hashes) {
      if (this.#map.has(hash)) {
        result.set(hash, this.#map.get(hash)!);
      } else {
        pending.add(hash);
      }
    }

    const promise = pending.size > 0
      ? this.#load(Array.from(pending))
      : Promise.resolve(new Map<t.Hash<unknown>, Response>());

    for (const hash of pending) {
      const response = promise.then((map) => map.get(hash)!);
      this.#map.set(hash, response);
      result.set(hash, response);
    }

    return Promise.all(
      Array.from(result.entries())
        .map(async ([hash, response]) => [hash, await response] as const),
    )
      .then((entries) =>
        entries.map(([hash, response]) => [
          hash as t.Hash<T>,
          response as t.Blob<T>,
        ])
      );
  }

  write<T>(_blob: t.Blob<T>): Promise<t.Hash<T>> {
    throw new Error("Method not implemented.");
  }

  read<T>(hash: t.Hash<T>): Promise<t.Blob<T>> {
    throw new Error("Method not implemented.");
  }

  resolve<T>(_prefix: t.Hash<T>): Promise<t.Hash<T>> {
    throw new Error("Method not implemented.");
  }
}

const isWorker = () =>
  typeof self !== "undefined" &&
  typeof Reflect.get(self, "WorkerGlobalScope") !== "undefined" &&
  self instanceof Reflect.get(self, "WorkerGlobalScope");

const isWindow = () =>
  typeof window !== "undefined" &&
  typeof document !== "undefined";

async function waitForRoot(): Promise<HTMLElement> {
  const now = performance.now();
  const root = await new Promise<HTMLElement>((resolve) => {
    const existing = document.getElementById("reframe-root");
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.getElementById("reframe-root");
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
  console.log("[waitForRoot]", performance.now(), performance.now() - now);
  return root;
}

function createRuntime(
  graph: t.linker.Graph,
  blob: t.blob.BlobStorage,
) {
  const reframe = {
    rsc: {} as {
      stream: ReadableStream<string>;
      controller: ReadableStreamDefaultController<string>;
    },
    graph,
    evaluator: evaluator(() => blob),
    _toEvaluate: [] as {
      signature: t.Hash<t.linker.BlockSignature>;
      symbol: string;
    }[],
    evaluate: (signature: t.Hash<t.linker.BlockSignature>, symbol: string) => {
      reframe._toEvaluate.push({ signature, symbol });
    },
    ctx: runtimeCtx,
  };

  reframe.rsc.stream = new ReadableStream({
    start(controller) {
      reframe.rsc.controller = controller;
    },
  });

  const runtime = reframe.evaluator().runtime(
    graph,
    new Map([
      ["/ctx", { runtime: runtimeCtx, Surprise, Specifier }],
      ["/yan", { yan: null, branch: null }],
    ]),
  );

  Reflect.set(reframe, "runtime", runtime);

  const __reframe = { ...reframe, runtime };
  Reflect.set(self, "__reframe", __reframe);

  return __reframe;
}

type Reframe = ReturnType<typeof createRuntime>;

const blob = new Blob();

if (isWorker()) {
  console.log("[worker]", `running from worker ${self.name}`);

  // wait for the main thread to send the graph
  // once graph is received, create the runtime
  // and evaluate client

  // add event listener for message
  let reframe: Reframe;

  self.addEventListener("message", async (event) => {
    if (event.data.type === "graph") {
      try {
        reframe = createRuntime(event.data.graph, blob);
        event.ports[0].postMessage({ type: "resolve" });
      } catch (error) {
        event.ports[0].postMessage({ type: "reject", error });
      }
    }

    if (event.data.type === "action") {
      const { specifier, name, args } = event.data;

      if (!reframe) {
        throw new Error("Runtime not initialized");
      }

      runtimeCtx.with(reframe.runtime, async () => {
        try {
          const fn = await reframe.runtime.$evaluate(
            self.name,
            specifier,
            name,
          );

          if (!fn || typeof fn !== "function") {
            throw new Error(
              `Action not found: ${specifier}#${name}`,
            );
          }

          const result = await fn(...args);

          console.log(
            "[worker]",
            result,
          );

          event.ports[0].postMessage({ type: "resolve", result });
        } catch (error) {
          console.error("[worker]", "error evaluating action", error);
          event.ports[0].postMessage({ type: "reject", error });
          return;
        }
      });
    }
  });
} else if (isWindow()) {
  const graphSrc = document.querySelector(
    "[data-role=graph]",
  ) as HTMLScriptElement;
  if (!graphSrc?.textContent) {
    throw new Error("graph not found");
  }

  const graph = JSON.parse(graphSrc.textContent) as t.linker.Graph;

  const reframe = createRuntime(graph, blob);

  reframe.ctx.with(reframe.runtime, async () => {
    const createClient = await reframe.runtime.import<
      () => {
        mount: (
          root: HTMLElement,
          stream: ReadableStream<string>,
        ) => Promise<void>;
        createServerReference: (
          specifier: t.SerializedSpecifier,
          name: string,
          importers: Importer[],
        ) => (...args: unknown[]) => Promise<unknown>;
        createWorkerReference: (
          env: string,
          specifier: t.SerializedSpecifier,
          name: string,
          importers: Importer[],
        ) => (...args: unknown[]) => Promise<unknown>;
      }
    >(
      "client",
      new Specifier("yan", "/~entry.ts", { env: "client" }),
      "createClient",
    );
    const client = createClient();
    const ctx = reframe.ctx.use();
    ctx.setServerActionRef(client.createServerReference);
    ctx.setWorkerActionRef(client.createWorkerReference);
    for (const { signature, symbol } of reframe._toEvaluate) {
      console.log("[warmup]", "[pre]", signature, symbol);
      ctx.warmup(signature, symbol);
    }
    reframe._toEvaluate = [];
    reframe.evaluate = (signature, symbol) => {
      console.log("[evaluate]", "[post]", signature, symbol);
      return ctx.warmup(signature, symbol);
    };

    const readSource = async (path: t.SerializedSpecifier) => {
      const node = ctx.graph.modules.get(path);
      if (!node) {
        throw new Error(`source not found: ${path}`);
      }

      const source = await blob.read(node.source);
      return source.text();
    };
    Reflect.set(reframe, "readSource", readSource);

    console.log("[mount]", client.mount);
    await client.mount(
      await waitForRoot(),
      reframe.rsc.stream,
    );
  }).catch((error) => {
    console.error("[error]", error);
  });
}
