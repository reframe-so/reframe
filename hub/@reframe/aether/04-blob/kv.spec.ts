import { test } from "./interface.spec.ts";
import { kv } from "./kv.mock.ts";

const blob = kv();

Deno.test("kv > db", async (t) => {
  await t.step("implements interface", test(blob));
});
