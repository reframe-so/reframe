import { assertEquals } from "jsr:@std/assert";
import { BlobStorage } from "./interface.ts";
import * as t from "./t.ts";

export const test = (storage: BlobStorage) => async (ctx: Deno.TestContext) => {
  await ctx.step("write and read", async () => {
    const content = "hello, world";
    const hash = await storage.write(new t.Blob(content));
    const read = await storage.read(hash);
    assertEquals(await read.text(), content);
  });

  await ctx.step("write and read big text", async () => {
    const content = "a".repeat(1024 * 1024);
    const hash = await storage.write(new t.Blob(content));
    const read = await storage.read(hash);
    assertEquals(await read.text(), content);
  });

  await ctx.step("write and read big binary", async () => {
    const content = new Uint8Array(1024 * 1024);
    const hash = await storage.write(new t.Blob(content));
    const read = await storage.read(hash);
    assertEquals(await read.bytes(), content);
  });

  await ctx.step("write and read emoji", async () => {
    const content = await Deno.readTextFile(
      import.meta.dirname + "/__specs__/emoji.txt",
    );
    const hash = await storage.write(new t.Blob(content));
    const read = await storage.read(hash);
    assertEquals(await read.text(), content);
  });

  await ctx.step("write and read emoji binary", async () => {
    const content = await Deno.readFile(
      import.meta.dirname + "/__specs__/emoji.txt",
    );
    const hash = await storage.write(new t.Blob(content));
    const read = await storage.read(hash);
    assertEquals(await read.bytes(), content);
  });
  await ctx.step("write and read image binary", async () => {
    const content = await Deno.readTextFile(
      import.meta.dirname + "/__specs__/image.jpg",
    );
    const hash = await storage.write(new t.Blob(content));
    const read = await storage.read(hash);
    const result = await read.text();
    assertEquals(result, content);
  });

  await ctx.step("write and read pdf binary", async () => {
    const content = await Deno.readTextFile(
      import.meta.dirname + "/__specs__/pdf.pdf",
    );
    const hash = await storage.write(new t.Blob(content));
    const read = await storage.read(hash);
    const result = await read.text();
    assertEquals(result, content);
  });

  await ctx.step("write and read image binary", async () => {
    const content = await Deno.readTextFile(
      import.meta.dirname + "/__specs__/image.jpg",
    );
    const hash = await storage.write(new t.Blob(content));
    const read = await storage.read(hash);
    const result = await read.text();
    assertEquals(result, content);
  });

  await ctx.step("write and read pdf binary", async () => {
    const content = await Deno.readTextFile(
      import.meta.dirname + "/__specs__/pdf.pdf",
    );
    const hash = await storage.write(new t.Blob(content));
    const read = await storage.read(hash);
    const result = await read.text();
    assertEquals(result, content);
  });
};
