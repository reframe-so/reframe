import { test } from "./interface.spec.ts";
import { namespace } from "./namespace.mock.ts";
import { simpleTest } from "./simple.spec.ts";

const kv = namespace();

Deno.test("kv > namespace", async (t) => {
  await t.step("implements interface", test(kv));
  await t.step("implements simple", simpleTest(kv));
});
