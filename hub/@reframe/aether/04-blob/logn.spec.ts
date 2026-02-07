import * as t from "./t.ts";
import { assertEquals } from "jsr:@std/assert";
import { test } from "./interface.spec.ts";
import { logn } from "./logn.mock.ts";

const blob = logn();

Deno.test("logn > db", async (t) => {
  await t.step("implements interface", test(blob));
});

Deno.test("logn > db > chain of files", async (ctx) => {
  const hashes: Record<string, string> = {};
  await ctx.step("first", async () => {
    hashes.first = await blob.write(new t.Blob("a"));
    const read = await blob.read(hashes.first as t.Hash<t.Blob>);
    assertEquals(await read.text(), "a");

    const pack = await blob.readPack(hashes.first as t.Hash<t.Blob>);
    assertEquals(pack.parent, null);
    assertEquals(pack.depth, 1);
    assertEquals(pack.first, hashes.first);
    assertEquals(pack.delta.length, 0);
  });

  await ctx.step("second", async () => {
    hashes.second = await blob.write(
      new t.Blob("ab", { parent: hashes.first }),
    );
    const read = await blob.read(hashes.second as t.Hash<t.Blob>);
    assertEquals(await read.text(), "ab");

    const pack = await blob.readPack(hashes.second as t.Hash<t.Blob>);
    assertEquals(pack.parent, hashes.first);
    assertEquals(pack.depth, 2);
    assertEquals(pack.first, hashes.second);
    assertEquals(pack.delta.length, 0);
  });

  await ctx.step("third", async () => {
    hashes.third = await blob.write(
      new t.Blob("abc", { parent: hashes.second }),
    );
    const read = await blob.read(hashes.third as t.Hash<t.Blob>);
    assertEquals(await read.text(), "abc");

    const pack = await blob.readPack(hashes.third as t.Hash<t.Blob>);
    assertEquals(pack.parent, hashes.second);
    assertEquals(pack.depth, 3);
    assertEquals(pack.first, hashes.second);
    assertEquals(pack.delta.length, 1);
  });

  await ctx.step("fourth", async () => {
    hashes.fourth = await blob.write(
      new t.Blob("abcd", { parent: hashes.third }),
    );
    const read = await blob.read(hashes.fourth as t.Hash<t.Blob>);
    assertEquals(await read.text(), "abcd");

    const pack = await blob.readPack(hashes.fourth as t.Hash<t.Blob>);
    assertEquals(pack.parent, hashes.third);
    assertEquals(pack.depth, 4);
    assertEquals(pack.first, hashes.fourth);
    assertEquals(pack.delta.length, 0);
  });

  await ctx.step("fifth", async () => {
    hashes.fifth = await blob.write(
      new t.Blob("abcde", { parent: hashes.fourth }),
    );
    const read = await blob.read(hashes.fifth as t.Hash<t.Blob>);
    assertEquals(await read.text(), "abcde");

    const pack = await blob.readPack(hashes.fifth as t.Hash<t.Blob>);
    assertEquals(pack.parent, hashes.fourth);
    assertEquals(pack.depth, 5);
    assertEquals(pack.first, hashes.fourth);
    assertEquals(pack.delta.length, 1);
  });

  await ctx.step("sixth", async () => {
    hashes.sixth = await blob.write(
      new t.Blob("abcdef", { parent: hashes.fifth }),
    );
    const read = await blob.read(hashes.sixth as t.Hash<t.Blob>);
    assertEquals(await read.text(), "abcdef");

    const pack = await blob.readPack(hashes.sixth as t.Hash<t.Blob>);
    assertEquals(pack.parent, hashes.fifth);
    assertEquals(pack.depth, 6);
    assertEquals(pack.first, hashes.fourth);
    assertEquals(pack.delta.length, 1);
  });

  await ctx.step("seventh", async () => {
    hashes.seventh = await blob.write(
      new t.Blob("abcdefg", { parent: hashes.sixth }),
    );
    const read = await blob.read(hashes.seventh as t.Hash<t.Blob>);
    assertEquals(await read.text(), "abcdefg");

    const pack = await blob.readPack(hashes.seventh as t.Hash<t.Blob>);
    assertEquals(pack.parent, hashes.sixth);
    assertEquals(pack.depth, 7);
    assertEquals(pack.first, hashes.fourth);
    assertEquals(pack.delta.length, 2);
  });

  await ctx.step("eighth", async () => {
    hashes.eighth = await blob.write(
      new t.Blob("abcdefgh", { parent: hashes.seventh }),
    );
    const read = await blob.read(hashes.eighth as t.Hash<t.Blob>);
    assertEquals(await read.text(), "abcdefgh");

    const pack = await blob.readPack(hashes.eighth as t.Hash<t.Blob>);
    assertEquals(pack.parent, hashes.seventh);
    assertEquals(pack.depth, 8);
    assertEquals(pack.first, hashes.eighth);
    assertEquals(pack.delta.length, 0);
  });

  await ctx.step("ninth", async () => {
    hashes.ninth = await blob.write(
      new t.Blob("abcdefghi", { parent: hashes.eighth }),
    );
    const read = await blob.read(hashes.ninth as t.Hash<t.Blob>);
    assertEquals(await read.text(), "abcdefghi");

    const pack = await blob.readPack(hashes.ninth as t.Hash<t.Blob>);
    assertEquals(pack.parent, hashes.eighth);
    assertEquals(pack.depth, 9);
    assertEquals(pack.first, hashes.eighth);
    assertEquals(pack.delta.length, 1);
  });

  await ctx.step("tenth", async () => {
    hashes.tenth = await blob.write(
      new t.Blob("abcdefghij", { parent: hashes.ninth }),
    );
    const read = await blob.read(hashes.tenth as t.Hash<t.Blob>);
    assertEquals(await read.text(), "abcdefghij");

    const pack = await blob.readPack(hashes.tenth as t.Hash<t.Blob>);
    assertEquals(pack.parent, hashes.ninth);
    assertEquals(pack.depth, 10);
    assertEquals(pack.first, hashes.eighth);
    assertEquals(pack.delta.length, 1);
  });
});

Deno.test("logn > db > 100 files", async (ctx) => {
  const hashes: Record<string, string> = {};
  await ctx.step("first", async () => {
    hashes[1] = await blob.write(new t.Blob("a"));
    const read = await blob.read(hashes[1] as t.Hash<t.Blob>);
    assertEquals(await read.text(), "a");

    const pack = await blob.readPack(hashes[1] as t.Hash<t.Blob>);
    assertEquals(pack.parent, null);
    assertEquals(pack.depth, 1);
    assertEquals(pack.first, hashes[1]);
    assertEquals(pack.delta.length, 0);
  });

  for (let i = 2; i <= 100; i++) {
    await ctx.step(`file ${i}`, async () => {
      hashes[i] = await blob.write(
        new t.Blob("a".repeat(i), { parent: hashes[i - 1] }),
      );
      const read = await blob.read(hashes[i] as t.Hash<t.Blob>);
      assertEquals(await read.text(), "a".repeat(i));

      const pack = await blob.readPack(hashes[i] as t.Hash<t.Blob>);
      assertEquals(pack.parent, hashes[i - 1]);
      assertEquals(pack.depth, i);

      const bits = (a: number) => {
        let count = 0;
        while (a > 0) {
          count += a & 1;
          a >>= 1;
        }
        return count;
      };

      const msb = (a: number) => {
        let count = 0;
        while (a > 0) {
          count++;
          a >>= 1;
        }
        return count - 1;
      };

      assertEquals(pack.first, hashes[1 << msb(i)]);
      assertEquals(pack.delta.length, bits(i) - 1);
    });
  }
});

Deno.test({
  name: "emojis",
  ignore: true, // diff-match-patch-es encodeURI fails on emoji strings (URI malformed)
  fn: async (ctx) => {
    const hashes: Record<string, string> = {};
    await ctx.step("verify emojis", async () => {
      hashes.first = await blob.write(new t.Blob(""));
      hashes.second = await blob.write(
        new t.Blob("🧪';\n ", { parent: hashes.first }),
      );
      hashes.third = await blob.write(
        new t.Blob("🧪';\n", { parent: hashes.second }),
      );

      assertEquals(
        await (await blob.read(hashes.first as t.Hash<t.Blob>)).text(),
        "",
      );

      assertEquals(
        await (await blob.read(hashes.second as t.Hash<t.Blob>)).text(),
        "🧪';\n ",
      );

      assertEquals(
        await (await blob.read(hashes.third as t.Hash<t.Blob>)).text(),
        "🧪';\n",
      );
    });
  },
});
