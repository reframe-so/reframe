import { AsyncLocalStorage } from "node:async_hooks";
import { Surprise } from "@reframe/surprise/index.ts";

export interface Provider<I> {
  with<R>(value: I, fn: () => Promise<R>): Promise<R>;
}

export interface Consumer<O> {
  use(): Awaited<O>;
  value(): { current: Awaited<O> } | undefined;
  run<R>(fn: (value: Awaited<O>) => R): R;
}

export const create = <I, O>(
  factory: (input: I) => O,
): Provider<I> & Consumer<O> => {
  const storage = new AsyncLocalStorage<{ current: Awaited<O> }>();

  return ({
    async with(value, fn) {
      const current = await factory(value);
      return storage.run({ current }, fn);
    },

    value() {
      return storage.getStore();
    },

    use() {
      const store = storage.getStore();

      if (store) {
        return store.current;
      }

      throw Surprise.with`context not set`;
    },

    run(fn) {
      return fn(this.use());
    },
  });
};
