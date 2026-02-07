import type { Runtime } from "./interface.ts";
import type * as t from "./t.ts";
import { Surprise } from "@reframe/surprise/index.ts";
import * as context from "../00-base/context.ts";
import { Importer } from "./evaluator.ts";
import { Specifier } from "../00-base/specifier.ts";

class ThenableModule {
  #reason: unknown;
  #value: Record<string, unknown> = {
    __esModule: true,
  };
  #status: "pending" | "fulfilled" | "rejected" = "pending";
  #promises: Map<string, () => Promise<unknown>> = new Map();

  get status() {
    return this.#status === "pending" ? undefined : this.#status;
  }

  set status(status: "fulfilled" | "rejected" | undefined) {
    if (status !== undefined) {
      this.#status = status;
      return;
    }
    throw Surprise.with`status can not be undefined`;
  }

  get value() {
    if (this.#status === "fulfilled") {
      return this.#value;
    }

    throw Surprise.with`module is not fulfilled`;
  }

  set value(value: Record<string, unknown>) {
    this.#value = value;
  }

  get reason() {
    if (this.#status === "rejected") {
      return this.#reason;
    }

    throw Surprise
      .with`module is not rejected [${this.#status}] (${this.#value})`;
  }

  set reason(reason: unknown) {
    this.#reason = reason;
  }

  compute(name: string, promise: () => Promise<unknown>) {
    if (name in this.#value) {
      return;
    }

    if (this.#promises.has(name)) {
      return;
    }

    this.#status = "pending";
    this.#promises.set(name, promise);
  }

  then(
    onFulfilled: (value: unknown) => void,
    onRejected: (error: unknown) => void,
  ) {
    return Promise.all(
      this.#promises.entries()
        .map(([symbol, promise]) =>
          promise().then(
            (value) => {
              this.#promises.delete(symbol);
              this.#value[symbol] = value;
            },
          )
        ),
    ).then(
      () => {
        this.#status = "fulfilled";
        return onFulfilled(this.#value);
      },
      (error) => {
        this.#status = "rejected";
        return onRejected(error);
      },
    );
  }
}

class ModuleCache {
  #cache = new Map<string, ThenableModule>();

  get(hash: t.Hash<t.linker.BlockSignature>) {
    if (this.#cache.has(hash)) {
      return this.#cache.get(hash)!;
    }
    const module = new ThenableModule();
    this.#cache.set(hash, module);
    return module;
  }
}

const moduleCache = new ModuleCache();

export const runtimeCtx = context.create((runtime: Runtime) => {
  const load = (hash: t.Hash<t.linker.BlockSignature>) => {
    return moduleCache.get(hash);
  };

  const require = (hash: t.Hash<t.linker.BlockSignature>) => {
    return moduleCache.get(hash);
  };

  const indices = new Map<t.Hash<t.linker.BlockSignature>, number>();
  for (const [index, block] of runtime.graph.blocks.entries()) {
    indices.set(block.signature, index);
  }

  const warmup = (
    signature: t.Hash<t.linker.BlockSignature>,
    name: string,
  ) => {
    const module = moduleCache.get(signature);

    // if name is like <A>.<B>, we should be able to handle it here
    const promise = () => runtime.evaluate("client", signature, name);

    module.compute(name, promise);
  };

  const createClientReference = (
    specifier: t.SerializedSpecifier,
    name: string,
  ) => {
    return new Proxy(
      {},
      {
        get(_, key) {
          if (key === "$$typeof") {
            return Symbol.for("react.client.reference");
          }

          if (key === "$$async") {
            return true;
          }

          if (key === "$$id") {
            const module = runtime.graph.modules.get(specifier);

            if (!module) {
              throw Surprise.with`module not found: ${specifier}`;
            }

            const reference = module.references.get(name);

            if (!reference) {
              throw Surprise.with`reference not found: ${specifier}#${name}`;
            }

            if (Array.isArray(reference)) {
              throw Surprise.with`reference is a map: ${specifier}#${name}`;
            }

            if ("specifier" in reference) {
              throw Surprise
                .with`reference is a reference: ${specifier}#${name}`;
            }

            const block = runtime.graph.blocks.get(reference.block);

            if (!block) {
              throw Surprise.with`block not found: ${specifier}#${name}`;
            }

            // console.log("[createClientReference]", {
            //   signature: block.signature,
            //   specifier,
            //   name,
            //   reference,
            // });

            warmup(block.signature, name);
            return `${block.signature}#${name}`;
          }

          return undefined;
        },
      },
    );
  };

  const actionRef = {
    createServerReference: null as
      | null
      | (
        (
          specifier: t.SerializedSpecifier,
          name: string,
          importers: Importer[],
        ) => (...args: unknown[]) => Promise<unknown>
      ),
    createWorkerReference: null as
      | null
      | (
        (
          env: string,
          specifier: t.SerializedSpecifier,
          name: string,
          importers: Importer[],
        ) => (...args: unknown[]) => Promise<unknown>
      ),
  };

  const createServerReference = (
    specifier: t.SerializedSpecifier,
    name: string,
    importers: Importer[],
  ) => {
    if (!actionRef.createServerReference) {
      throw Surprise.with`createServerReference is not set`;
    }

    return actionRef.createServerReference(
      specifier,
      name,
      importers,
    );
  };

  const createWorkerReference = (
    specifier: t.SerializedSpecifier,
    name: string,
    importers: Importer[],
  ) => {
    if (!actionRef.createWorkerReference) {
      throw Surprise.with`createWorkerReference is not set`;
    }

    const deserialized = Specifier.deserialize(specifier);

    return actionRef.createWorkerReference(
      deserialized.attributes.env,
      specifier,
      name,
      importers,
    );
  };

  return {
    ...runtime,
    load,
    require,
    warmup,
    createClientReference,
    createServerReference,
    createWorkerReference,
    setServerActionRef: (
      createServerReference: (
        specifier: t.SerializedSpecifier,
        name: string,
        importers: Importer[],
      ) => (...args: unknown[]) => Promise<unknown>,
    ) => {
      actionRef.createServerReference = createServerReference;
    },
    setWorkerActionRef: (
      createWorkerReference: (
        env: string,
        specifier: t.SerializedSpecifier,
        name: string,
        importers: Importer[],
      ) => (...args: unknown[]) => Promise<unknown>,
    ) => {
      actionRef.createWorkerReference = createWorkerReference;
    },
  };
});
