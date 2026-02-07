import {
  type BlockSignature,
  bundler,
  type Hash,
  runtime,
  type SerializedSpecifier,
  Surprise,
} from "lib:ctx";

export class CatchSurprise extends Surprise.extend<{
  render: () => React.ReactNode;
}>("catch") {
  render() {
    return this.ctx.render();
  }
}

import React, { type ReactNode, createElement, Fragment, Suspense } from "npm:react";
import {
  decodeReply,
  renderToReadableStream as createRscStream,
} from "npm:react-server-dom-webpack/server.edge";
import {
  createFromReadableStream,
  encodeReply,
} from "npm:react-server-dom-webpack/client.edge";

import { hydrateRoot } from "npm:react-dom/client";

import { type ServerSentEventMessage, ServerSentEventStream } from "./sse.ts";

import {
  type EventSourceMessage,
  EventSourceParserStream,
} from "npm:eventsource-parser/stream";

declare global {
  interface Window {
    __reframe: {
      evaluate: (signature: string, symbol: string) => void;
      graph: unknown;
      rsc: { controller: TransformStreamDefaultController<string> };
    };
  }
  // deno-lint-ignore no-var
  var __reframe: Window["__reframe"];
}

type Script =
  & { kind: "script"; attributes?: Record<string, string> }
  & (
    | { src: string; onLoad?: string }
    | { content: string }
  );

type Style = {
  kind: "style";
  content: string;
  attributes?: Record<string, string>;
};

export type Asset = Script | Style;

export const Shell = ({
  assets = [],
  children,
}: {
  assets?: Asset[];
  children?: React.ReactNode;
}) => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {assets.map((asset, index) => (
          <Fragment key={index}>
            {asset.kind === "script"
              ? (
                "src" in asset
                  ? (
                    <>
                      <script src={asset.src} {...asset.attributes} />
                      {"onLoad" in asset && asset.onLoad
                        ? <script>{asset.onLoad}</script>
                        : null}
                    </>
                  )
                  : (
                    <script key={index} {...asset.attributes}>
                      {asset.content}
                    </script>
                  )
              )
              : (
                <style key={index} {...asset.attributes}>
                  {asset.content}
                </style>
              )}
          </Fragment>
        ))}
      </head>
      <body>
        <Suspense>{children}</Suspense>
      </body>
    </html>
  );
};

export const toEventStream = (value: unknown): ReadableStream<Uint8Array> =>
  stream(value, {})
    .pipeThrough(
      new TransformStream<ReactServerStreamPayload, ServerSentEventMessage>({
        transform(chunk, controller) {
          controller.enqueue({
            event: chunk.type,
            data: JSON.stringify(chunk.data),
          });
        },
      }),
    )
    .pipeThrough(new ServerSentEventStream());

const render = async (element: React.ReactElement) => {
  // @ts-ignore - symbols and target are reframe-specific import options
  const { renderToReadableStream } = await import("npm:react-dom/server", {
    with: { env: "client" },
    symbols: ["renderToReadableStream"],
    target: "client",
  });

  const onError = (error: Error) => {
    // TODO: 3 - put it to another stream and then send that stream to the client
    console.error("[[render-error]]", Surprise.from(error).format());
  };

  const stream = await renderToReadableStream(
    <Suspense fallback={<>** changeme: suspense fallback **</>}>
      {element}
    </Suspense>,
    { onError },
  );

  return new ReadableStream(
    {
      type: "bytes",
      async start(controller) {
        try {
          const reader = stream.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            controller.enqueue(value);
          }

          controller.close();
        } catch (error) {
          console.log("[error]", Surprise.from(error).format());
          controller.error(Surprise.from(error).format());
        }
      },
    },
    { highWaterMark: 0 },
  );
};

type ReactServerStreamPayload =
  | {
    type: "bootstrap";
    data: {
      app: {
        name: string;
        org: string;
      };
      script: string;
      root: string;
      widget: boolean;
    };
  }
  | {
    type: "asset";
    data: Asset;
  }
  | {
    type: "rsc";
    data: {
      length: string;
      content: string;
    };
  }
  | {
    type: "chunks";
    data: {
      path: `/${string}`;
      hashes: Record<string, string | null>;
    };
  }
  | {
    type: "chunk";
    data: {
      signature: string;
      symbol: string;
    };
  }
  | {
    type: "error";
    data: string;
  }
  | {
    type: "close";
    data: null;
  };

const serverMap = new Proxy(
  {},
  {
    get(target, property) {
      if (typeof property === "string" && property.includes("#")) {
        const [module, name] = property.split("#");

        return {
          name,
          id: module,
          chunks: [module],
        };
      }

      return undefined;
    },
  },
);

export function renderRsc(value: unknown) {
  return new Response(toEventStream(value), {
    headers: { "content-type": "text/plain" },
  });
}

export const reply = async (request: Request) => {
  try {
    const serverAction = request.headers.get("x-reframe-server-action");

    if (!serverAction) {
      throw new Error("missing x-reframe-server-action header");
    }

    const isPlainText = request.headers
      .get("content-type")
      ?.startsWith("text/plain");

    const args = await decodeReply(
      !isPlainText ? await request.formData() : await request.text(),
      serverMap,
    );
    const [signature, name] = serverAction.split("#");

    console.log("[server-action]", signature, name);
    const fn = await runtime
      .use()
      .$evaluate("server", signature as SerializedSpecifier, name);

    if (typeof fn !== "function") {
      throw new Error(`${name} of ${signature} is not a function`);
    }

    const result = await fn(...args);

    return renderRsc({ success: true, result });
  } catch (unknown) {
    const surprise = Surprise.from(unknown);
    console.log("[reply-error]", surprise.format());

    return renderRsc({ success: false, surprise: surprise.render() });
  }
};

export const toStream = (
  value: unknown,
  options?: {
    onError: (error: unknown) => void;
  },
): ReadableStream<Uint8Array> => createRscStream(value, serverMap, options);

const stream = (
  element: unknown,
  {
    assets,
    widget = false,
    root,
  }: {
    assets?: Asset[];
    widget?: boolean;
    root?: string;
  },
) => {
  return new ReadableStream<ReactServerStreamPayload>({
    async start(controller) {
      const stream = toStream(element, {
        onError: (err: unknown) => {
          console.error(
            "[[another-render-error]]",
            Surprise.from(err).format(),
          );
          controller.enqueue({
            type: "error",
            data: err instanceof Error ? err.message : String(err),
          });
          return "digest";
        },
      });

      const reader = stream.getReader();
      const decoder = new TextDecoder();

      for (const asset of assets ?? []) {
        controller.enqueue({ type: "asset", data: asset });
      }

      while (true) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const content = decoder.decode(value);

          const pattern =
            /(^|\n)[a-zA-Z0-9]+:I\["([^"]+)",(\[[^\]]*\]),"([^"]+)",1\]/g;

          const matches = Array.from(content.matchAll(pattern));

          for (const match of matches) {
            controller.enqueue({
              type: "chunk",
              data: {
                signature: match[2],
                symbol: match[4],
              },
            });
          }

          controller.enqueue({
            type: "rsc",
            data: {
              length: Number(value.length).toString(16),
              content,
            },
          });
        } catch (err) {
          controller.enqueue({
            type: "error",
            data: err instanceof Error ? err.message : String(err),
          });
        }
      }

      controller.enqueue({ type: "close", data: null });
      controller.close();
    },
  });
};

const Stream = async <P,>({
  reader,
  render,
}: {
  reader: ReadableStreamDefaultReader<P>;
  render: (value: P) => React.ReactElement | null;
}) => {
  const { done, value } = await reader.read();
  if (done) {
    return null;
  }

  return (
    <>
      {render(value)}
      <Suspense>
        <Stream reader={reader} render={render} />
      </Suspense>
    </>
  );
};

export const Render = ({
  children,
  root = "reframe-root",
}: React.PropsWithChildren<{ root?: string }>): React.ReactElement => {
  // todo: add `signal` to the options
  const r = stream(children, { root });

  const [r1, r2] = r.tee();

  const el = createFromReadableStream(
    r1
      .pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if (chunk.type === "rsc") {
              controller.enqueue(chunk.data.content);
            }
          },
        }),
      )
      .pipeThrough(new TextEncoderStream()),
    {
      serverConsumerManifest: {},
    },
  );

  return (
    <>
      <div id="reframe-root">{el}</div>
      <Suspense>
        <Stream
          reader={r2.getReader()}
          render={(chunk: ReactServerStreamPayload) => {
            if (chunk.type === "rsc") {
              return (
                <script data-length={chunk.data.length}>
                  {`self.__reframe.rsc.controller.enqueue(${
                    JSON.stringify(
                      chunk.data.content,
                    ).replace(/</g, "\\u003c")
                  });`}
                </script>
              );
            }

            if (chunk.type === "chunk") {
              return (
                <script>
                  {`self.__reframe.evaluate("${chunk.data.signature}","${chunk.data.symbol}");`}
                </script>
              );
            }

            return null;
          }}
        />
      </Suspense>
    </>
  );
};

export const defaultRenderer = async (
  element: React.ReactNode,
  status: number = 200,
) => {
  const { bootstrap, tailwind } = await bundler.bundle();
  const serializedGraph = runtime.use().serializedGraph;

  return new Response(
    await render(
      <Shell
        assets={[
          {
            kind: "script",
            content: serializedGraph,
            attributes: {
              type: "application/json",
              "data-role": "graph",
            },
          },
          {
            kind: "script",
            content: tailwind,
            attributes: {
              "data-role": "tailwind",
            },
          },
          {
            kind: "script",
            content: bootstrap,
            attributes: {
              "data-role": "bootstrap",
            },
          },
        ]}
      >
        <Render>
          <Suspense>{element}</Suspense>
        </Render>
      </Shell>,
    ),
    {
      status,
      headers: { "content-type": "text/html" },
    },
  );
};

export const mount = async (
  root: HTMLElement,
  stream: ReadableStream<string>,
) => {
  Reflect.set(self, "__DEV__", true);
  Reflect.set(self, "process", { env: { NODE_ENV: "development" } });

  console.warn("[hydrate] create stream");

  const element = await createFromReadableStream(
    stream.pipeThrough(new TextEncoderStream()),
    { serverConsumerManifest: {} },
  );

  console.warn("[hydrate] start", performance.now());

  await hydrateRoot(root, element, {
    onCaughtError: (...args: unknown[]) =>
      console.log({
        caughtError: args,
      }),
    onUncaughtError: (...args: unknown[]) => console.log(args[0]),
    onRecoverableError: (error: Error) => {
      console.warn("Logged recoverable error: " + error.message);
      console.log(error);
    },
  });

  console.log("[hydrate] done", performance.now());
};

export async function createFromFetch<T>(
  input: string | URL,
  init?: RequestInit,
) {
  const response = await fetch(input, init);

  if (!response.body) {
    throw new Error(`No body in response`);
  }

  if (!response.ok) {
    throw new Error(
      `Error ${response.status} - ${response.url}\n${await response
        .text()}`,
    );
  }

  const eventStream = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .pipeThrough(
      new TransformStream<EventSourceMessage, string>({
        transform: (event, controller) => {
          if (event.event === "rsc") {
            const { content } = JSON.parse(event.data);
            controller.enqueue(content);
            return;
          }

          if (event.event === "chunk") {
            const { signature, symbol } = JSON.parse(event.data);
            console.log("[chunk]", signature, symbol, self.__reframe.evaluate);
            self.__reframe.evaluate(signature, symbol);
            return;
          }
        },
      }),
    )
    .pipeThrough(new TextEncoderStream());

  const res = await createFromReadableStream<
    | { success: true; result: unknown }
    | {
      success: false;
      error: {
        message: string;
        render: ReactNode;
      };
    }
  >(eventStream, { serverConsumerManifest: {} });

  return res;
}

export const createServerReference = (
  signature: Hash<BlockSignature>,
  name: string,
  _importers: unknown[],
) => {
  return async (...args: unknown[]) => {
    const endpoint = "/";

    const result = await createFromFetch<
      | { success: true; result: unknown }
      | {
        success: false;
        error: { message: string; render: ReactNode };
      }
    >(endpoint, {
      method: "POST",
      headers: {
        "x-reframe-server-action": `${signature}#${name}`,
      },
      body: await encodeReply(args),
    });

    if (result.success) {
      return result.result;
    }

    console.log(result.surprise);

    throw new CatchSurprise({ render: () => result.surprise });
  };
};

const workerCache = new Map<string, Promise<Worker>>();

export const getOrCreateWorker = (env: string): Promise<Worker> => {
  if (workerCache.has(env)) {
    return workerCache.get(env)!;
  }

  const workerPromise = (async () => {
    const bootstrapScript = document.querySelector(
      'script[data-role="bootstrap"]',
    );

    if (!bootstrapScript) {
      throw new Error('No bootstrap script found with data-role="bootstrap"');
    }

    const workerSource = bootstrapScript.textContent;

    if (!workerSource) {
      throw new Error("Bootstrap script is empty");
    }

    const blob = new Blob([workerSource], { type: "application/javascript" });
    const workerUrl = URL.createObjectURL(blob);

    const worker = new Worker(workerUrl, {
      name: env,
    });

    worker.onerror = (error) => {
      console.error("[worker-error]", error);
      // Remove from cache on error so it can be retried
      workerCache.delete(env);
    };

    return new Promise<Worker>((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port2.onmessage = (event) => {
        if (event.data.type === "resolve") {
          resolve(worker);
        } else if (event.data.type === "reject") {
          // Remove from cache on initialization failure
          workerCache.delete(env);
          reject(new Error(event.data.error));
        }
      };

      const graph = self.__reframe.graph;
      if (!graph) {
        // Remove from cache on graph error
        workerCache.delete(env);
        throw new Error("Graph is not available in the worker context");
      }

      worker.postMessage(
        {
          type: "graph",
          graph,
        },
        [channel.port1],
      );
    });
  })();

  workerCache.set(env, workerPromise);
  return workerPromise;
};

export const createWorkerReference = (
  env: string,
  specifier: SerializedSpecifier,
  name: string,
) => {
  return async (...args: unknown[]) => {
    const worker = await getOrCreateWorker(env);
    const channel = new MessageChannel();

    worker.postMessage(
      {
        type: "action",
        specifier,
        name,
        args,
      },
      [channel.port1],
    );

    return new Promise((resolve, reject) => {
      channel.port2.onmessage = (event) => {
        // console.log("[worker-message]", event.data);
        if (event.data.type === "resolve") {
          resolve(event.data.result);
        } else if (event.data.type === "reject") {
          reject(event.data.error);
        }
      };
    });
  };
};

export function createClient() {
  return {
    mount,
    createServerReference,
    createWorkerReference,
  };
}
