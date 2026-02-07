import { assertEquals, assertRejects } from "jsr:@std/assert";
import * as index from "./index.ts";
import * as t from "./t.ts";

import { yan } from "../05-yan/yan.mock.ts";

async function testResolve(ctx: Deno.TestContext) {
  const y = yan();

  // Create a mock context for the reader
  const mockCtx = t.context.create(async () => {
    const head = await y.write(null, {
      "/@/test.ts": new t.Blob("test"),
    });
    const tree = await y.tree(head);
    return { head, workingTree: y.workingTree(tree) };
  });

  const reader = index.yan(
    index.terminal(),
    { ctx: mockCtx },
  )();

  await ctx.step("with absolute path", async () => {
    await mockCtx.with({}, async () => {
      const importer = new t.Specifier("yan", "/org/name/path", {});
      const resolved = await reader.resolve("/foo/bar", {}, importer);

      assertEquals(resolved.scheme, "yan");
      assertEquals(resolved.path, "/foo/bar");
      assertEquals(resolved.attributes, {});
    });
  });

  await ctx.step("with relative path", async () => {
    await mockCtx.with({}, async () => {
      const importer = new t.Specifier("yan", "/org/name/path", {});
      const resolved = await reader.resolve("./foo/bar", {}, importer);

      assertEquals(resolved.scheme, "yan");
      assertEquals(resolved.path, "/org/name/foo/bar");
      assertEquals(resolved.attributes, {});
    });
  });

  await ctx.step("with parent relative path", async () => {
    await mockCtx.with({}, async () => {
      const importer = new t.Specifier("yan", "/org/name/path/to/file", {});
      const resolved = await reader.resolve("../bar", {}, importer);

      assertEquals(resolved.scheme, "yan");
      assertEquals(resolved.path, "/org/name/path/bar");
      assertEquals(resolved.attributes, {});
    });
  });

  await ctx.step("with @/ path", async () => {
    await mockCtx.with({}, async () => {
      const importer = new t.Specifier("yan", "/@org/name/path/to/file", {});
      const resolved = await reader.resolve("@/foo/bar", {}, importer);

      assertEquals(resolved.scheme, "yan");
      assertEquals(resolved.path, "/@/foo/bar");
      assertEquals(resolved.attributes, {});
    });
  });

  await ctx.step("with attributes", async () => {
    await mockCtx.with({}, async () => {
      const importer = new t.Specifier("yan", "/org/name/path", { key: "value" });
      const resolved = await reader.resolve(
        "/foo/bar",
        { other: "attr" },
        importer,
      );

      assertEquals(resolved.scheme, "yan");
      assertEquals(resolved.path, "/foo/bar");
      assertEquals(resolved.attributes, { key: "value", other: "attr" });
    });
  });
}

async function testRead(ctx: Deno.TestContext) {
  const y = yan();

  // Write test files to yan
  const head = await y.write(null, {
    "/org/name/lib.ts": new t.Blob("lib"),
    "/org/name/directory/foo": new t.Blob("foo"),
  });
  const tree = await y.tree(head);

  // Create a mock context for the reader
  const mockCtx = t.context.create(() => {
    return { head, workingTree: y.workingTree(tree) };
  });

  const reader = index.yan(
    index.terminal(),
    { ctx: mockCtx },
  )();

  await ctx.step("with valid path", async () => {
    await mockCtx.with({}, async () => {
      const specifier = new t.Specifier("yan", "/org/name/lib.ts", {});

      // Should return a blob that points to the content
      const blob = await reader.read<string>(specifier);

      // Verify content
      assertEquals(
        await blob.text(),
        "lib",
      );
    });
  });

  await ctx.step("with invalid path", async () => {
    await mockCtx.with({}, async () => {
      const specifier = new t.Specifier("yan", "/not/existing/path", {});

      // Should throw error about not found path
      await assertRejects(
        () => reader.read(specifier),
        t.Surprise,
        "not found: /not/existing/path",
      );
    });
  });

  await ctx.step("with directory path", async () => {
    await mockCtx.with({}, async () => {
      const specifier = new t.Specifier("yan", "/org/name/directory", {});

      // Should throw error about expecting a blob but getting a tree
      await assertRejects(
        () => reader.read(specifier),
        t.Surprise,
        "not a blob:",
      );
    });
  });
}

Deno.test("Reader > YanReader", async (ctx) => {
  await ctx.step("resolve operations", async (t) => {
    await testResolve(t);
  });

  await ctx.step("read operations", async (t) => {
    await testRead(t);
  });
});
