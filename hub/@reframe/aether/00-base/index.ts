export * as context from "./context.ts";
export * as observe from "./observe.ts";
export * as test from "./test.ts";
export * from "./factory.ts";
export * from "./kind.ts";
export * from "@reframe/utils/path.ts";
export * from "./common.ts";
export * from "./specifier.ts";
export * from "./diff.ts";
export * from "./tracer.ts";

export type Test<T> = (_: T) => (ctx: Deno.TestContext) => Promise<void>;
