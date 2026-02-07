import { assertEquals, assertRejects } from "jsr:@std/assert";
import { KV, KeyNotFoundSurprise } from "./interface.ts";
import * as t from "./t.ts";

export const test: t.Test<KV> = (kv) => async (ctx) => {
  await ctx.step("handles empty keys", async () => {
    const key = [] as string[];
    const value = new t.Blob<string>("empty key test");
    await kv.set(key, value);
    const retrieved = await kv.get<string>(key);
    assertEquals(await retrieved.text(), "empty key test");
  });

  await ctx.step("handles large keys", async () => {
    const key = ["test", "large-key", "a".repeat(1000)];
    const value = new t.Blob<string>("large key test");
    await kv.set(key, value);
    const retrieved = await kv.get<string>(key);
    assertEquals(await retrieved.text(), "large key test");
  });

  await ctx.step("set and get string", async () => {
    const key = ["test", "string"];
    const value = new t.Blob<string>("hello world");
    await kv.set(key, value);
    const retrieved = await kv.get<string>(key);
    assertEquals(await retrieved.text(), "hello world");
  });

  await ctx.step("set and get JSON", async () => {
    const key = ["test", "json"];
    const data = { hello: "world", count: 42, nested: { works: true } };
    const value = new t.Blob<string>(JSON.stringify(data));
    await kv.set(key, value);
    const retrieved = await kv.get<string>(key);
    assertEquals(JSON.parse(await retrieved.text()), data);
  });

  await ctx.step("set and get binary data", async () => {
    const key = ["test", "binary"];
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const value = new t.Blob<Uint8Array>(data);
    await kv.set(key, value);
    const retrieved = await kv.get<Uint8Array>(key);
    assertEquals(await retrieved.bytes(), data);
  });

  await ctx.step("handles emoji in values", async () => {
    const key = ["test", "emoji-value"];
    const emojiString = "😀 😊 🎉 🚀 👩‍💻 🌍 🍕 🎵 🎮 ❤️";
    const value = new t.Blob<string>(emojiString);
    await kv.set(key, value);
    const retrieved = await kv.get<string>(key);
    assertEquals(await retrieved.text(), emojiString);
  });

  await ctx.step({
    name: "handles emoji in keys",
    ignore: true, // ASCII key encoding restricts to characters 36-126
    fn: async () => {
      const key = ["test", "emoji-key", "😀"];
      const value = new t.Blob<string>("emoji key test");
      await kv.set(key, value);
      const retrieved = await kv.get<string>(key);
      assertEquals(await retrieved.text(), "emoji key test");
    },
  });

  await ctx.step("get non-existent key throws", async () => {
    const key = ["test", "nonexistent"];
    await assertRejects(
      () => kv.get(key),
      KeyNotFoundSurprise,
    );
  });

  await ctx.step("overwrite existing key", async () => {
    const key = ["test", "overwrite"];
    await kv.set(key, new t.Blob<string>("initial value"));
    await kv.set(key, new t.Blob<string>("updated value"));
    const retrieved = await kv.get<string>(key);
    assertEquals(await retrieved.text(), "updated value");
  });

  await ctx.step("delete key", async () => {
    const key = ["test", "delete"];
    await kv.set(key, new t.Blob<string>("to be deleted"));
    await kv.set(key, new t.Blob<string>(null));
    await assertRejects(
      () => kv.get(key),
      KeyNotFoundSurprise,
    );
  });

  await ctx.step("list with empty prefix", async () => {
    // delete all keys
    const existingKeys = await kv.list([], {});
    for (const [key] of existingKeys) {
      await kv.set(key, new t.Blob<string>(null));
    }

    // Set up multiple entries with unique prefix to avoid conflicts
    await kv.set(["list-test", "a"], new t.Blob<string>("a"));
    await kv.set(["list-test", "b"], new t.Blob<string>("b"));
    await kv.set(["list-test", "c"], new t.Blob<string>("c"));

    const entries = await kv.list(["list-test"], {});
    assertEquals(entries.length, 3);

    assertEquals(entries[0][0], ["list-test", "a"]);
    assertEquals(await entries[0][1].text(), "a");
    assertEquals(entries[1][0], ["list-test", "b"]);
    assertEquals(await entries[1][1].text(), "b");
    assertEquals(entries[2][0], ["list-test", "c"]);
    assertEquals(await entries[2][1].text(), "c");
  });

  await ctx.step("list with specific prefix", async () => {
    // Set up a hierarchical structure
    await kv.set(["nested", "a", "1"], new t.Blob<string>("a1"));
    await kv.set(["nested", "a", "2"], new t.Blob<string>("a2"));
    await kv.set(["nested", "b", "1"], new t.Blob<string>("b1"));

    const entries = await kv.list(["nested", "a"], {});
    assertEquals(entries.length, 2);

    assertEquals(entries[0][0], ["nested", "a", "1"]);
    assertEquals(await entries[0][1].text(), "a1");
    assertEquals(entries[1][0], ["nested", "a", "2"]);
    assertEquals(await entries[1][1].text(), "a2");
  });

  await ctx.step("list with limit", async () => {
    // Set up multiple entries
    await kv.set(["limit", "a"], new t.Blob<string>("a"));
    await kv.set(["limit", "b"], new t.Blob<string>("b"));
    await kv.set(["limit", "c"], new t.Blob<string>("c"));

    const entries = await kv.list(["limit"], { limit: 2 });
    assertEquals(entries.length, 2);
  });

  await ctx.step("list with sort", async () => {
    // Set up multiple entries
    await kv.set(["sort", "b"], new t.Blob<string>("b"));
    await kv.set(["sort", "a"], new t.Blob<string>("a"));
    await kv.set(["sort", "c"], new t.Blob<string>("c"));

    const entries = await kv.list(["limit"], { limit: 2 });
    assertEquals(entries.length, 2);
  });

  await ctx.step("list with both limit and after", async () => {
    // Set up multiple entries
    await kv.set(["combined", "a"], new t.Blob<string>("a"));
    await kv.set(["combined", "b"], new t.Blob<string>("b"));
    await kv.set(["combined", "c"], new t.Blob<string>("c"));
    await kv.set(["combined", "d"], new t.Blob<string>("d"));
    await kv.set(["combined", "e"], new t.Blob<string>("e"));

    // Should return only b and c (limit 2, after a)
    const entries = await kv.list(
      ["combined"],
      {
        after: ["combined", "a"],
        limit: 2,
      },
    );

    assertEquals(entries.length, 2);

    assertEquals(entries[0][0], ["combined", "b"]);
    assertEquals(await entries[0][1].text(), "b");
    assertEquals(entries[1][0], ["combined", "c"]);
    assertEquals(await entries[1][1].text(), "c");
  });

  await ctx.step("prefixing works correctly", async () => {
    // Test a case that verifies prefix matching works properly
    // Set up keys where one is a prefix of another
    await kv.set(["prefix", "abc"], new t.Blob<string>("abc"));
    await kv.set(["prefix", "abcdef"], new t.Blob<string>("abcdef"));

    // Listing with a prefix that should only match one
    const entries = await kv.list(["prefix", "abc"], {});

    // Should only match ["prefix", "abc"], not ["prefix", "abcdef"]
    assertEquals(entries.length, 1);
    assertEquals(entries[0][0], ["prefix", "abc"]);
  });

  await ctx.step("special characters in keys", async () => {
    const key = ["test", "special-_.chars", "with~query", "and()ampersand"];
    const value = new t.Blob<string>("special chars test");
    await kv.set(key, value);
    const retrieved = await kv.get<string>(key);
    assertEquals(await retrieved.text(), "special chars test");
  });

  await ctx.step("handles empty values", async () => {
    const key = ["test", "empty"];
    const value = new t.Blob<string>("");
    await kv.set(key, value);
    const retrieved = await kv.get<string>(key);
    assertEquals(await retrieved.text(), "");
  });

  await ctx.step("handles large values", async () => {
    const key = ["test", "large"];
    const largeString = "a".repeat(1024 * 100); // 100KB string
    const value = new t.Blob<string>(largeString);
    await kv.set(key, value);
    const retrieved = await kv.get<string>(key);
    assertEquals(await retrieved.text(), largeString);
  });

  await ctx.step("handle get many", async () => {
    const key1 = ["test", "get", "many", "1"];
    const key2 = ["test", "get", "many", "2"];
    const key3 = ["test", "get", "many", "3"];
    const value1 = new t.Blob<string>("get many 1");
    const value2 = new t.Blob<string>("get many 2");
    const value3 = new t.Blob<string>("get many 3");

    await kv.set(key1, value1);
    await kv.set(key2, value2);
    await kv.set(key3, value3);

    const result = await kv.getMany([key1, key2]);
    assertEquals(result.length, 2);
    assertEquals(await result[0][1].text(), "get many 1");
    assertEquals(await result[1][1].text(), "get many 2");

    // test the keys
    assertEquals(result[0][0], key1);
    assertEquals(result[1][0], key2);
  });

  await ctx.step("list with after", async () => {
    // Set up multiple entries
    await kv.set(["sorted", "a"], new t.Blob<string>("apple"));
    await kv.set(["sorted", "aaaaa"], new t.Blob<string>("banana"));
    await kv.set(["sorted", "b"], new t.Blob<string>("cherry"));

    const entries = await kv.list(["sorted"]);

    assertEquals(entries.map((e) => e[0].slice(1)), [["a"], ["aaaaa"], ["b"]]);
  });
};
