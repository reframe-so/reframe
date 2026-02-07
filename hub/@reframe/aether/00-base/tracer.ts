import { AsyncLocalStorage } from "node:async_hooks";
import { Surprise } from "@reframe/surprise/index.ts";

interface Service {
  org: string;
  frame: string;
  branch: string;
  commit: string;
  config: string;
}

interface Session {
  id: string;
  service: Service;
}

interface Request {
  method: string;
}

interface EventBase {
  // unique event id
  id: number;
  // correlators
  traceId: string;
  // the span this event belongs to (same as spanId on starts)
  spanId: number;
  // high-res epoch millis
  timestamp: number;

  // user/session/request correlation
  requestId?: string;
  sessionId?: string;

  // arbitrary extras
  attributes?: Record<string, unknown>;

  kind: string;
}

interface SpanStart extends EventBase {
  kind: "span.start";
  name: string;
}

interface SpanEnd extends EventBase {
  kind: "span.end";
  surprise?: unknown;
}

interface Log extends EventBase {
  kind: "log";
  level: "debug" | "info" | "warn";
  message: string;
}

interface Metric extends EventBase {
  kind: "metric";
  name: string;
  value: number;
  labels?: string[];
}

class TracerSurprise extends Surprise.extend("tracer") {}
class TracerNotInitialized extends TracerSurprise.extend("not-initialized") {}
class InvalidSpanEnd
  extends TracerSurprise.extend<{ id: number }>("invalid-span-end") {}

export type TracerEvent = SpanStart | SpanEnd | Log | Metric;

export class Tracer extends EventTarget {
  #store = new AsyncLocalStorage<{
    traceId: string;
    requestId?: string;
    sessionId?: string;
    spanId: number;
    depth: number;
    activeSpans: Map<number, SpanStart>;
    tick: () => number;
  }>();

  #epoch = Date.now();

  #emit<E extends EventBase>(
    event: Omit<
      E,
      "id" | "traceId" | "timestamp" | "requestId" | "sessionId" | "spanId"
    >,
  ) {
    const store = this.#store.getStore();

    if (store) {
      const timestamp = performance.now();

      const detail = {
        ...event,
        id: store.tick(),
        spanId: store.spanId,
        traceId: store.traceId,
        timestamp: this.#epoch + timestamp,
        requestId: store.requestId,
        sessionId: store.sessionId,
      } as E;

      super.dispatchEvent(new CustomEvent("event", { detail }));

      return detail;
    }

    throw new TracerNotInitialized({});
  }

  startSpan(name: string): number {
    const store = this.#store.getStore();

    if (store) {
      const span = this.#emit<SpanStart>({
        kind: "span.start",
        name,
      });

      store.activeSpans.set(span.id, span);

      return span.id;
    }

    throw new TracerNotInitialized({});
  }

  endSpan(id: number, surprise?: unknown): void {
    const store = this.#store.getStore();

    if (store) {
      const span = store.activeSpans.get(id);

      if (!span) {
        throw new InvalidSpanEnd({ id });
      }

      this.#emit<SpanEnd>({
        kind: "span.end",
        surprise,
      });

      store.activeSpans.delete(id);
    }
  }

  log(level: "debug" | "info" | "warn", message: string): void {
    this.#emit<Log>({ kind: "log", level, message });
  }

  observe(name: string, value: number, labels?: string[]): void {
    this.#emit<Metric>({ kind: "metric", name, value, labels });
  }

  trace<O>(...args: [() => O] | [string, () => O]): O {
    let counter = 0;

    return this.#store.run({
      traceId: crypto.randomUUID(),
      spanId: 0,
      depth: 0,
      activeSpans: new Map(),
      tick: () => counter++,
    }, () => this.span(...args));
  }

  span<O>(
    ...args: [() => O] | [string, () => O]
  ): O {
    if (typeof args[0] !== "string") {
      return this.span("anonymous", args[0]);
    }

    const [name, fn] = args as [string, () => O];
    const store = this.#store.getStore();

    if (!store) {
      return fn();
    }

    const spanId = this.startSpan(name);

    return this.#store.run({
      ...store,
      depth: store.depth + 1,
      spanId,
    }, () => {
      try {
        const result = fn();
        if (!(result instanceof Promise)) {
          this.endSpan(spanId);
          return result;
        }

        return result.then((result) => {
          this.endSpan(spanId);
          return result;
        }, (surprise) => {
          this.endSpan(spanId, surprise);
          throw surprise;
        }) as O;
      } catch (surprise) {
        this.endSpan(spanId, surprise);
        throw surprise;
      }
    });
  }
}

export const tracer = new Tracer();
