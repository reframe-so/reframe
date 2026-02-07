import { create } from "./context.ts";

interface Span {
  kind: string;
  id: string;
  parentId?: string;
  name: string;
  start: {
    time: number;
    data: string;
  };
  end?: {
    time: number;
    surprise: boolean;
    data: string;
  };
  children: Span[];
}

interface Trace extends Span {
  kind: "trace";
}

interface Session extends Span {
  kind: "session";
}

const ctx = create(() => {
});

export function step<T>(_name: string, fn: () => T) {
  const value = ctx.value();

  if (!value) {
    return fn();
  }

  return fn();
}

export function trace<T>(name: string, fn: () => T) {
  return ctx.with<T>(
    null,
    async () => {
      // patch console
      // return step(name, fn);
      try {
        return await step(name, fn);
      } catch (error) {
        throw error;
      } finally {
        // unpatch console
      }
    },
  );
}
