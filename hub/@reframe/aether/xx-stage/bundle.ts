import * as esbuild from "npm:esbuild@^0.23.0";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.11.1";
import { task } from "../00-base/factory.ts";

const asyncHooksPolyfillPlugin: esbuild.Plugin = {
  name: "custom-async-hooks-polyfill",
  setup(build) {
    build.onResolve({ filter: /^node:async_hooks$/ }, (args) => {
      return { path: args.path, namespace: "async-hooks-polyfill" };
    });

    build.onLoad(
      { filter: /^node:async_hooks$/, namespace: "async-hooks-polyfill" },
      () => {
        return {
          contents: `
            export class AsyncLocalStorage {
              #storage = {};
              getStore() {
                if (Reflect.has(this.#storage, "current")) {
                  return this.#storage.current;
                }
                
                throw new Error("no context");
              }
              run(value, fn, ...args) {
                this.#storage.current = value;
                return fn(...args);
              }
            }
          `,
          loader: "ts",
        };
      },
    );
  },
};

export const createBundler = () => {
  const opts: esbuild.BuildOptions = {
    plugins: [
      asyncHooksPolyfillPlugin,
      ...denoPlugins({
        loader: "native",
      }),
    ],

    bundle: true,
    format: "iife",
    target: "esnext",
    platform: "browser",
    treeShaking: true,
    minify: true,
    jsx: "automatic",
    splitting: false,
    logLevel: "error",
    external: [],
    sourcemap: false,
    write: false,
  };

  const build_ = (path: string) =>
    task(async () => {
      const context = await esbuild.context({
        ...opts,
        entryPoints: [import.meta.resolve(path)],
      });
      const result = await context.rebuild();
      if (!result.outputFiles?.length) {
        throw new Error(`no output files for ${path}`);
      }

      return result.outputFiles[0].text;
    });

  const bundle_ = task(async () => {
    const startTime = performance.now();

    const [bootstrap, tailwind] = await Promise.all([
      build_("./bootstrap.ts").perform(),
      build_("./tailwind.ts").perform(),
    ]);

    const dt = performance.now() - startTime;
    console.log(`%c✅ Built JS in ${dt.toFixed(2)}ms`, `color: green`);
    return { bootstrap, tailwind };
  });

  return {
    bundle: () => bundle_.perform(),
    stop: () => esbuild.stop(),
  };
};

export type Bundler = ReturnType<typeof createBundler>;
