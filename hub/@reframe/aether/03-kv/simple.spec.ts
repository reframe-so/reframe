import * as t from "./t.ts";
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { test } from "./interface.spec.ts";
import { simple } from "./simple.mock.ts";
import { KV } from "./index.ts";
import { KeyNotFoundSurprise, XVersion } from "./interface.ts";

const kv = simple();

export const simpleTest: t.Test<KV> = (kv) => async (ctx) => {
  await ctx.step("handles atomic operations", async () => {
    // set a new key
    const key = ["test", "atomic", "operation"];
    const value = new t.Blob<string>("atomic operation test");
    const v1 = await kv.set(key, value);
    assertEquals(await v1.text(), "atomic operation test");
    assertEquals(v1.metadata[XVersion], "1");

    // update the key
    const updatedValue = new t.Blob<string>("updated atomic operation test");
    const v2 = await kv.set(key, updatedValue);
    assertEquals(await v2.text(), "updated atomic operation test");
    assertEquals(v2.metadata[XVersion], "2");

    await assertRejects(
      () =>
        kv.set(
          key,
          new t.Blob<string>("atomic update test", {
            [XVersion]: "1",
          }),
        ),
      KeyNotFoundSurprise,
    );

    // updating with version 2 should pass

    const v3 = await kv.set(
      key,
      new t.Blob<string>("updated atomic operation test", {
        [XVersion]: "2",
      }),
    );
    assertEquals(await v3.text(), "updated atomic operation test");
    assertEquals(v3.metadata[XVersion], "3");

    // try to delete the key with version 2
    await assertRejects(
      () => kv.set(key, new t.Blob<string>(null, { [XVersion]: "2" })),
      KeyNotFoundSurprise,
    );

    // delete the key with version 3
    await kv.set(key, new t.Blob<string>(null, { [XVersion]: "3" }));
    await assertRejects(
      () => kv.get(key),
      KeyNotFoundSurprise,
    );

    // try again to set with version 0
    await assertRejects(
      () =>
        kv.set(
          key,
          new t.Blob<string>("atomic update test", {
            [XVersion]: "0",
          }),
        ),
      KeyNotFoundSurprise,
    );

    // set without version
    const v4 = await kv.set(key, new t.Blob<string>("set without version"));
    assertEquals(await v4.text(), "set without version");
    assertEquals(v4.metadata[XVersion], "1");
  });
};

Deno.test("kv > db", async (t) => {
  await t.step("implements interface", test(kv));
  await t.step("implements simple", simpleTest(kv));
});
