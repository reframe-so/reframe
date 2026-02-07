import { measure } from "../../00-base/measure.ts";
import { aether } from "../aether.ts";
import { router } from "../hypervisor.ts";
import { bundler } from "../serve.ts";
import { hashes } from "./blobs.ts";

measure.enable();

type Branch = { org: string; frame: string; branch: string };

const parseBranch = (raw: string): Branch => {
  const input = raw.startsWith("@") ? raw.slice(1) : raw;
  const [org, frame, branch, ...rest] = input.split("/").filter(Boolean);
  if (!org || !frame || !branch || rest.length) {
    throw new Error(`Invalid branch: ${raw} (expected @org/frame/branch)`);
  }
  return { org, frame, branch };
};

const cleanBenchCache = async (
  runtimeServerUrl: string,
  target: Branch,
  opts: {
    deletePath?: "/~/";
    writeNonce?: boolean;
    noncePath?: "/@/.nonce";
  } = {},
) => {
  const deletePath = opts.deletePath ?? "/~/";
  const writeNonce = opts.writeNonce ?? true;
  const noncePath = opts.noncePath ?? "/@/.nonce";

  const url =
    `${runtimeServerUrl}/@${target.org}/${target.frame}/${target.branch}/write`;

  const nonce = Date.now().toString();

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: {
        [deletePath]: null,
        ...(writeNonce ? { [noncePath]: nonce } : {}),
      },
      message: `bench: clean ${deletePath}${
        writeNonce ? ` + write ${noncePath}=${nonce}` : ""
      } at ${new Date().toISOString()}`,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to clean (${deletePath}) via ${url}: ${response.status} ${
        await response.text()
      }`,
    );
  }
};

const repeat = <T>(n: number, fn: () => Promise<T>) => {
  return () => Promise.all(Array.from({ length: n }).fill(0).map(fn));
};

const map = <I, O>(input: I[], fn: (i: I) => Promise<O>) => {
  return () => Promise.all(input.map(fn));
};

const pause = () =>
  new Promise((resolve) => {
    const timer = setTimeout(() => { }, 999999999);
    Reflect.set(self, "resume", () => resolve(clearTimeout(timer)));
  });

// await pause();

await bundler.bundle();
const runtimeServerPort = 8017;
const runtimeServerUrl = `http://localhost:${runtimeServerPort}`;
const benchBranch = parseBranch(
  Deno.env.get("BENCH_BRANCH") ?? "@reframe/hive/bench-1",
);
const server = Deno.serve({
  port: runtimeServerPort,
  onListen: async () => {
    router().setRuntimeServerUrl(runtimeServerUrl);
    // Ensure each run is a cold compile by deleting the compiled cache stored in /~.
    // NOTE: This hits the *local* runtime server, so it will not update prod.
    await cleanBenchCache(runtimeServerUrl, benchBranch, {
      deletePath: "/~/",
      writeNonce: true,
      noncePath: "/@/.nonce",
    });

    // await pause();
    const r1 = await measure.span(
      "evaluate",
      repeat(1, async () => {
        return router().fetch(
          new Request(
            "https://reframe--hive--bench-1.reframe.dev",
          ),
        );
      }),
    );

    // await pause();

    const _b1 = await measure.span(
      "render",
      map(r1, (response) => response.text()),
    );

    // await pause();
    performance.mark("fetch-blobs-start");
    const _s1 = await measure.span(
      "fetch blobs",
      map(
        hashes,
        (hash) =>
          router().fetch(new Request(`https://reframe--hive--bench-1.reframe.dev/~/b/${hash}`)),
      ),
    );

    performance.mark("fetch-blobs-end");
    performance.measure("fetch-blobs", "fetch-blobs-start", "fetch-blobs-end");

    performance.mark("download-blobs-start");

    const _s2 = await measure.span(
      "download blobs",
      map(_s1, (response) => response.bytes()),
    );

    performance.mark("download-blobs-end");
    performance.measure(
      "download-blobs",
      "download-blobs-start",
      "download-blobs-end",
    );
    await pause();

    const r2 = await measure.span(
      "evaluate again",
      repeat(1, async () => {
        return router().fetch(
          new Request(
            "https://reframe--hive--bench-1.reframe.dev",
          ),
        );
      }),
    );

    const _b2 = await measure.span(
      "render again",
      map(r2, (response) => response.text()),
    );
  },
}, (request) => aether().fetch(request));
