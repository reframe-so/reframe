import * as t from "./t.ts";
import { Commit, Yan, Tree } from "./index.ts";
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { yan } from "./yan.mock.ts";
import { NotFoundSurprise } from "./interface.ts";

export const test = (yan: Yan) => async (ctx: Deno.TestContext) => {
  const commits: Record<string, t.Hash<Commit> | null> = {};
  commits.zero = null;

  await ctx.step("write a1 to /@/a.ts", async () => {
    commits.one = await yan.write(commits.zero, {
      "/@/a.ts": new t.Blob("a1"),
    });
    assertEquals(await (await yan.read(commits.one, "/@/a.ts")).text(), "a1");

    await assertRejects(
      async () => await yan.read(commits.one, "/@/b.ts"),
      NotFoundSurprise,
    );
  });

  await ctx.step("write b1 to /@/b.ts", async () => {
    commits.two = await yan.write(commits.one, {
      "/@/b.ts": new t.Blob("b1"),
    });

    assertEquals(await (await yan.read(commits.two, "/@/b.ts")).text(), "b1");
  });

  await ctx.step("write a2, b2 to /@/a.ts, /@/b.ts", async () => {
    commits.three = await yan.write(commits.two, {
      "/@/a.ts": new t.Blob("a2"),
      "/@/b.ts": new t.Blob("b2"),
    });

    assertEquals(await (await yan.read(commits.three, "/@/a.ts")).text(), "a2");
    assertEquals(await (await yan.read(commits.three, "/@/b.ts")).text(), "b2");
  });

  await ctx.step("delete /@/b.ts", async () => {
    commits.four = await yan.write(commits.three, {
      "/@/b.ts": new t.Blob(null),
    });

    await assertRejects(
      async () => await yan.read(commits.four, "/@/b.ts"),
      NotFoundSurprise,
    );
  });

  await ctx.step("write d1 to /@/c/d.ts", async () => {
    commits.five = await yan.write(commits.four, {
      "/@/c/d.ts": new t.Blob("d1"),
    });

    assertEquals(
      await (await yan.read(commits.five, "/@/c/d.ts")).text(),
      "d1",
    );

    await assertRejects(
      async () =>
        await yan.write(commits.five, {
          "/@/c": new t.Blob("c1"),
        }),
      Error,
      "expected a blob",
    );

    assertEquals(
      await yan.list(commits.five, "/@/c"),
      {
        "d.ts": {
          kind: "blob",
          hash:
            `637140a8a0a8e97655585db60b46b89af928c2c431953a2ec77b766e113a38a3` as t.Hash<
              string
            >,
        },
      },
    );
  });

  await ctx.step("write e1 to /@/c/e.ts", async () => {
    commits.six = await yan.write(commits.five, {
      "/@/c/e.ts": new t.Blob("e1"),
    });

    assertEquals(await (await yan.read(commits.six, "/@/c/e.ts")).text(), "e1");

    await assertRejects(
      async () =>
        await yan.write(commits.six, {
          "/@/c/e.ts/example": new t.Blob("e2"),
        }),
      Error,
      "expected a tree",
    );

    assertEquals(
      await yan.list(commits.six, "/@/c"),
      {
        "d.ts": {
          kind: "blob",
          hash:
            `637140a8a0a8e97655585db60b46b89af928c2c431953a2ec77b766e113a38a3` as t.Hash<
              string
            >,
        },
        "e.ts": {
          kind: "blob",
          hash:
            `9c1372673066e42ed5a2f7e4f88898d24a6ee2d5ee552d8d6cb60234eaf64923` as t.Hash<
              string
            >,
        },
      },
    );
  });

  await ctx.step("update d1, a2, delete e1", async () => {
    commits.seven = await yan.write(commits.six, {
      "/@/c/d.ts": new t.Blob("d2"),
      "/@/a.ts": new t.Blob("a3"),
      "/@/c/e.ts": new t.Blob(null),
    });

    assertEquals(
      await (await yan.read(commits.seven, "/@/c/d.ts")).text(),
      "d2",
    );
    assertEquals(await (await yan.read(commits.seven, "/@/a.ts")).text(), "a3");

    await assertRejects(
      async () => await yan.read(commits.seven, "/@/c/e.ts"),
      NotFoundSurprise,
    );

    assertEquals(
      await yan.list(commits.seven, "/@/c"),
      {
        "d.ts": {
          kind: "blob",
          hash:
            `71df75541f3ee9d14a6eecd051a88e1cf16f3ff146901a0886406caffe31004d` as t.Hash<
              string
            >,
        },
      },
    );
  });

  await ctx.step("delete /@/c/d.ts", async () => {
    commits.eight = await yan.write(commits.seven, {
      "/@/c/d.ts": new t.Blob(null),
    });

    await assertRejects(
      async () => await yan.read(commits.eight, "/@/c/d.ts"),
      NotFoundSurprise,
    );

    await assertRejects(
      async () => await yan.list(commits.eight, "/@/c"),
      NotFoundSurprise,
    );

    commits.nine = await yan.write(commits.eight, {
      "/@/c": new t.Blob("c1"),
    });

    assertEquals(await (await yan.read(commits.nine, "/@/c")).text(), "c1");

    await assertRejects(
      async () => await yan.read(commits.nine, "/@/c/d.ts"),
      Error,
      "expected a directory",
    );
  });

  await ctx.step("verify commits", async () => {
    assertEquals(
      await yan.ancestor(commits.nine),
      commits.eight,
    );

    assertEquals(
      await yan.ancestor(commits.eight, 3),
      commits.five,
    );

    await assertEquals(
      await yan.ancestor(commits.eight, 10),
      null,
    );

    assertEquals(
      (await yan.log(commits.nine, 3)).map((x) => x.hash),
      [commits.nine, commits.eight, commits.seven],
    );

    assertEquals(
      (await yan.log(commits.eight, 10)).map((x) => x.hash),
      [
        commits.eight,
        commits.seven,
        commits.six,
        commits.five,
        commits.four,
        commits.three,
        commits.two,
        commits.one,
      ],
    );
  });

  await ctx.step("verfy commit jumps", async () => {
    assertEquals(
      (await yan.commit(commits.one)).jump,
      null,
    );

    assertEquals(
      (await yan.commit(commits.two)).jump,
      commits.one,
    );

    assertEquals(
      (await yan.commit(commits.three)).jump,
      null,
    );

    assertEquals(
      (await yan.commit(commits.four)).jump,
      commits.three,
    );

    assertEquals(
      (await yan.commit(commits.five)).jump,
      commits.four,
    );

    assertEquals(
      (await yan.commit(commits.six)).jump,
      commits.three,
    );

    assertEquals(
      (await yan.commit(commits.seven)).jump,
      null,
    );

    assertEquals(
      (await yan.commit(commits.eight)).jump,
      commits.seven,
    );

    assertEquals(
      (await yan.commit(commits.nine)).jump,
      commits.eight,
    );
  });

  await ctx.step("verify lca", async () => {
    commits.a = await yan.write(commits.zero, {
      "/@/a": new t.Blob("a"),
    });

    commits.b = await yan.write(commits.a, {
      "/@/b": new t.Blob("b"),
    });

    commits.c = await yan.write(commits.b, {
      "/@/c": new t.Blob("c"),
    });

    commits.d = await yan.write(commits.zero, {
      "/@/d": new t.Blob("d"),
    });

    commits.e = await yan.write(commits.d, {
      "/@/e": new t.Blob("e"),
    });
    commits.f = await yan.write(commits.e, {
      "/@/f": new t.Blob("f"),
    });

    commits.g = await yan.write(commits.f, {
      "/@/g": new t.Blob("g"),
    });

    commits.h = await yan.write(commits.d, {
      "/@/h": new t.Blob("h"),
    });

    commits.i = await yan.write(commits.h, {
      "/@/i": new t.Blob("i"),
    });

    commits.j = await yan.write(commits.i, {
      "/@/j": new t.Blob("j"),
    });

    commits.x = await yan.write(commits.e, {
      "/@/x": new t.Blob("x"),
    });

    commits.y = await yan.write(commits.x, {
      "/@/y": new t.Blob("y"),
    });

    commits.z = await yan.write(commits.y, {
      "/@/z": new t.Blob("z"),
    });

    commits.k = await yan.write(commits.i, {
      "/@/k": new t.Blob("k"),
    });

    // now verify lca

    assertEquals(
      await yan.lca(commits.a, commits.b),
      commits.a,
    );
    assertEquals(
      await yan.lca(commits.b, commits.a),
      commits.a,
    );

    assertEquals(
      await yan.lca(commits.a, commits.c),
      commits.a,
    );
    assertEquals(
      await yan.lca(commits.c, commits.a),
      commits.a,
    );

    assertEquals(
      await yan.lca(commits.a, commits.d),
      commits.zero,
    );
    assertEquals(
      await yan.lca(commits.d, commits.a),
      commits.zero,
    );

    assertEquals(
      await yan.lca(commits.a, commits.e),
      commits.zero,
    );
    assertEquals(
      await yan.lca(commits.e, commits.a),
      commits.zero,
    );

    assertEquals(
      await yan.lca(commits.a, commits.f),
      commits.zero,
    );
    assertEquals(
      await yan.lca(commits.f, commits.a),
      commits.zero,
    );

    assertEquals(
      await yan.lca(commits.a, commits.g),
      commits.zero,
    );
    assertEquals(
      await yan.lca(commits.g, commits.a),
      commits.zero,
    );

    assertEquals(
      // await commits.a.yan.lca(commits.h),
      await yan.lca(commits.h, commits.a),
      commits.zero,
    );
    assertEquals(
      await yan.lca(commits.a, commits.h),
      commits.zero,
    );

    assertEquals(
      await yan.lca(commits.i, commits.a),
      commits.zero,
    );
    assertEquals(
      await yan.lca(commits.a, commits.i),
      commits.zero,
    );

    assertEquals(
      await yan.lca(commits.j, commits.a),
      commits.zero,
    );
    assertEquals(
      await yan.lca(commits.a, commits.j),
      commits.zero,
    );

    assertEquals(
      await yan.lca(commits.x, commits.a),
      commits.zero,
    );
    assertEquals(
      await yan.lca(commits.a, commits.x),
      commits.zero,
    );

    assertEquals(
      await yan.lca(commits.j, commits.e),
      commits.d,
    );
    assertEquals(
      await yan.lca(commits.e, commits.j),
      commits.d,
    );

    assertEquals(
      await yan.lca(commits.i, commits.e),
      commits.d,
    );
    assertEquals(
      await yan.lca(commits.e, commits.i),
      commits.d,
    );

    assertEquals(
      await yan.lca(commits.h, commits.e),
      commits.d,
    );
    assertEquals(
      await yan.lca(commits.e, commits.h),
      commits.d,
    );

    assertEquals(
      await yan.lca(commits.g, commits.z),
      commits.e,
    );
    assertEquals(
      await yan.lca(commits.g, commits.z),
      commits.e,
    );

    assertEquals(
      await yan.lca(commits.z, commits.f),
      commits.e,
    );
    assertEquals(
      await yan.lca(commits.f, commits.z),
      commits.e,
    );

    assertEquals(
      await yan.lca(commits.j, commits.k),
      commits.i,
    );
    assertEquals(
      await yan.lca(commits.k, commits.j),
      commits.i,
    );
  });

  const commits1: Record<string, t.Hash<Commit> | null> = {};
  commits1.zero = null;

  await ctx.step("verify apply", async () => {
    commits1.pp = await yan.write(commits1.zero, {
      "/@/a.ts": new t.Blob("a1"),
      "/@/x/a.ts": new t.Blob("xa1"),
      "/~/a.ts": new t.Blob("a1"),
      "/~/x/a.ts": new t.Blob("xa1"),
    });

    commits1.qq = await yan.write(commits1.zero, {
      "/@/a.ts": new t.Blob("a2"),
      "/@/x/b.ts": new t.Blob("xa2"),
      "/~/a.ts": new t.Blob("a1"),
      "/~/x/a.ts": new t.Blob("xa1"),
    });

    const diff = await yan.diff(commits1.pp, commits1.qq);

    const merge = await yan.apply(commits1.pp, diff);
    assertEquals(
      await (await yan.read(merge, "/@/a.ts")).text(),
      "<<<<<<< HEAD\na1\n=======\na2\n>>>>>>>",
    );
    assertEquals(await (await yan.read(merge, "/@/x/a.ts")).text(), "xa1");
    assertEquals(await (await yan.read(merge, "/@/x/b.ts")).text(), "xa2");
    assertEquals(await (await yan.read(merge, "/~/a.ts")).text(), "a1");
    assertEquals(await (await yan.read(merge, "/~/x/a.ts")).text(), "xa1");
  });

  await ctx.step("verify diff and apply", async () => {
    commits1.one = await yan.write(commits1.zero, {
      "/@/a.ts": new t.Blob("a1"),
      "/@/x/a.ts": new t.Blob("xa1"),
    });

    commits1.two = await yan.write(commits1.one, {
      "/@/a.ts": new t.Blob("a2"),
      "/@/x/b.ts": new t.Blob("xa2"),
    });

    commits1.onetwo = await yan.apply(
      commits1.one,
      await yan.diff(commits1.one, commits1.two),
    );

    assertEquals(await yan.diff(commits1.one, commits1.two), {
      remove: {
        "/@/a.ts": {
          kind: "blob",
          hash:
            "91a4e4b9447fc2adc18bb04a120b68765a800d692d7063750050c4579ee8fe43" as t.Hash<unknown>,
        },
      },
      add: {
        "/@/a.ts": {
          kind: "blob",
          hash:
            "d6f4532a24eeb29fa33b2b5828100832396eb5aead58956811e9656db4e0ff74" as t.Hash<unknown>,
        },
        "/@/x/b.ts": {
          kind: "blob",
          hash:
            "63eabf64b44c538574af7446c0decf415bb2bc966defea5847ca0d02a1afc4a7" as t.Hash<unknown>,
        },
      },
      conflict: {},
    });

    assertEquals(
      await (await yan.read(commits1.onetwo, "/@/a.ts")).text(),
      "a2",
    );
    assertEquals(
      await (await yan.read(commits1.onetwo, "/@/x/a.ts")).text(),
      "xa1",
    );
    assertEquals(
      await (await yan.read(commits1.onetwo, "/@/x/b.ts")).text(),
      "xa2",
    );

    commits1.three = await yan.write(commits1.two, {
      "/@/y/z": new t.Blob("yz1"),
      "/@/x/b.ts": new t.Blob("xb1"),
    });

    commits1.onethree = await yan.apply(
      commits1.one,
      await yan.diff(commits1.one, commits1.three),
    );

    assertEquals(await yan.diff(commits1.one, commits1.three), {
      remove: {
        "/@/a.ts": {
          kind: "blob",
          hash:
            "91a4e4b9447fc2adc18bb04a120b68765a800d692d7063750050c4579ee8fe43" as t.Hash<unknown>,
        },
      },
      add: {
        "/@/a.ts": {
          kind: "blob",
          hash:
            "d6f4532a24eeb29fa33b2b5828100832396eb5aead58956811e9656db4e0ff74" as t.Hash<unknown>,
        },
        "/@/x/b.ts": {
          kind: "blob",
          hash:
            "f5ab55ca3886250225b3212882c22db3e926f8113c76c822ee72091d2101ade6" as t.Hash<unknown>,
        },
        "/@/y": {
          kind: "tree",
          hash:
            "5f3a5043dfa6b82e7e496c407785599e9fc69b71553537333d17ea505edf5cb8" as t.Hash<Tree>,
        },
      },
      conflict: {},
    });
    assertEquals(
      await (await yan.read(commits1.onethree, "/@/a.ts")).text(),
      "a2",
    );
    assertEquals(
      await (await yan.read(commits1.onethree, "/@/x/a.ts")).text(),
      "xa1",
    );
    assertEquals(
      await (await yan.read(commits1.onethree, "/@/x/b.ts")).text(),
      "xb1",
    );
    assertEquals(
      await (await yan.read(commits1.onethree, "/@/y/z")).text(),
      "yz1",
    );

    commits1.four = await yan.write(commits1.two, {
      "/@/x/a.ts": new t.Blob("xa3"),
      "/@/y/z/a.ts": new t.Blob("yza1"),
    });

    commits1.threefour = await yan.apply(
      commits1.two,
      await yan.diff(commits1.two, commits1.four),
    );

    assertEquals(await yan.diff(commits1.three, commits1.four), {
      remove: {
        "/@/x/a.ts": {
          kind: "blob",
          hash:
            "ffbe5ad37a5b744ec1cac77baba67eb625815c90bfa6f4ace6057f9f03bab857" as t.Hash<unknown>,
        },
        "/@/x/b.ts": {
          kind: "blob",
          hash:
            "63eabf64b44c538574af7446c0decf415bb2bc966defea5847ca0d02a1afc4a7" as t.Hash<unknown>,
        },
      },
      add: {
        "/@/x/a.ts": {
          kind: "blob",
          hash:
            "290c896d9a09bda338b929e67e9265905bb314538d88eb61cc6777ec1db5fedb" as t.Hash<unknown>,
        },
        "/@/x/b.ts": {
          kind: "blob",
          hash:
            "f5ab55ca3886250225b3212882c22db3e926f8113c76c822ee72091d2101ade6" as t.Hash<unknown>,
        },
      },
      conflict: {
        "/@/y/z": {
          left: {
            kind: "blob",
            hash:
              "23f29f2b878f0071e08d96bf9ba6bc8d7728b41be8498bd521659906ca01a9a7" as t.Hash<unknown>,
          },
          right: {
            kind: "tree",
            hash:
              "097a00f52e273aca6d99237476d84e705ccfd60b2fa9c24d956559458adc8826" as t.Hash<Tree>,
          },
        },
      },
    });

    assertEquals(
      await (await yan.read(commits1.threefour, "/@/x/a.ts")).text(),
      "xa3",
    );
    assertEquals(
      await (await yan.read(commits1.threefour, "/@/x/b.ts")).text(),
      "xa2",
    );
    assertEquals(
      await (await yan.read(commits1.threefour, "/@/y/z/a.ts")).text(),
      "yza1",
    );

    commits1.five = await yan.write(commits1.one, {
      "/@/y/z": new t.Blob("yz2"),
      "/@/x/b.ts": new t.Blob("xb2"),
      "/@/x/a.ts": new t.Blob("xa4"),
    });

    commits1.threefive = await yan.apply(
      commits1.three,
      await yan.diff(commits1.three, commits1.five),
    );

    assertEquals(await yan.diff(commits1.three, commits1.five), {
      remove: {
        "/@/a.ts": {
          kind: "blob",
          hash:
            "91a4e4b9447fc2adc18bb04a120b68765a800d692d7063750050c4579ee8fe43" as t.Hash<unknown>,
        },
        "/@/x/a.ts": {
          kind: "blob",
          hash:
            "ffbe5ad37a5b744ec1cac77baba67eb625815c90bfa6f4ace6057f9f03bab857" as t.Hash<unknown>,
        },
      },
      add: {
        "/@/a.ts": {
          kind: "blob",
          hash:
            "d6f4532a24eeb29fa33b2b5828100832396eb5aead58956811e9656db4e0ff74" as t.Hash<unknown>,
        },
        "/@/x/a.ts": {
          kind: "blob",
          hash:
            "835ee6f98fb815e3d421f434f1e824bf781e430139c1ba54790a7c3f2e8d721e" as t.Hash<unknown>,
        },
        "/@/x/b.ts": {
          kind: "blob",
          hash:
            "f946c4418334dc54a3f154bc8a800246666acc3e068c025af2360f11250668b0" as t.Hash<unknown>,
        },
        "/@/y/z": {
          kind: "blob",
          hash:
            "f0d454d59adf0c7359d2e780769bab5aeee121bab361ec3c47107c38b268d55e" as t.Hash<unknown>,
        },
      },
      conflict: {},
    });

    assertEquals(
      await (await yan.read(commits1.threefive, "/@/a.ts")).text(),
      "a2",
    );

    assertEquals(
      await (await yan.read(commits1.threefive, "/@/x/a.ts")).text(),
      "xa4",
    );

    assertEquals(
      await (await yan.read(commits1.threefive, "/@/x/b.ts")).text(),
      `<<<<<<< HEAD\nxb1\n=======\nxb2\n>>>>>>>`,
    );

    assertEquals(
      await (await yan.read(commits1.threefive, "/@/y/z")).text(),
      `<<<<<<< HEAD\nyz1\n=======\nyz2\n>>>>>>>`,
    );
  });

  // 1. Basic diff and apply round-trip.
  await ctx.step("basic diff/apply round-trip", async () => {
    commits1.one = await yan.write(commits1.zero, {
      "/@/a.ts": new t.Blob("a1"),
      "/@/x/a.ts": new t.Blob("xa1"),
    });

    commits1.two = await yan.write(commits1.one, {
      "/@/a.ts": new t.Blob("a2"),
      "/@/x/b.ts": new t.Blob("xa2"),
    });

    // Calculate diff from commit one to two and apply it.
    commits1.onetwo = await yan.apply(
      commits1.one,
      await yan.diff(commits1.one, commits1.two),
    );

    // Verify diff contents.
    assertEquals(await yan.diff(commits1.one, commits1.two), {
      remove: {
        "/@/a.ts": {
          kind: "blob",
          hash:
            "91a4e4b9447fc2adc18bb04a120b68765a800d692d7063750050c4579ee8fe43" as t.Hash<unknown>,
        },
      },
      add: {
        "/@/a.ts": {
          kind: "blob",
          hash:
            "d6f4532a24eeb29fa33b2b5828100832396eb5aead58956811e9656db4e0ff74" as t.Hash<unknown>,
        },
        "/@/x/b.ts": {
          kind: "blob",
          hash:
            "63eabf64b44c538574af7446c0decf415bb2bc966defea5847ca0d02a1afc4a7" as t.Hash<unknown>,
        },
      },
      conflict: {},
    });

    // Verify file contents after apply.
    assertEquals(
      await (await yan.read(commits1.onetwo, "/@/a.ts")).text(),
      "a2",
    );
    assertEquals(
      await (await yan.read(commits1.onetwo, "/@/x/a.ts")).text(),
      "xa1",
    );
    assertEquals(
      await (await yan.read(commits1.onetwo, "/@/x/b.ts")).text(),
      "xa2",
    );
  });

  // 2. Conflict - File-to-directory and directory-to-file conversion.
  await ctx.step(
    "file-to-directory / directory-to-file conversion",
    async () => {
      // Start with a file at path /a.
      commits1.alpha = await yan.write(commits1.zero, {
        "/a": new t.Blob("file-content"),
      });

      // Replace the file with a directory (and add a file inside).
      commits1.beta = await yan.write(commits1.zero, {
        "/a/b.txt": new t.Blob("inside-dir"),
      });

      const diff = await yan.diff(commits1.alpha, commits1.beta);
      // const applied = await commits1.alpha.apply(diff);

      assertEquals(diff, {
        remove: {},
        add: {},
        conflict: {
          "/a": {
            left: {
              kind: "blob",
              hash:
                "64862c6b5357f1cd4c9056e3fa760b38b56afa3a04b1e64196071beee67e477f" as t.Hash<unknown>,
            },
            right: {
              kind: "tree",
              hash:
                "bf65d66347bbb8586b423e4fee952a9334e3dec76fdb1f144e962e32f79df332" as t.Hash<Tree>,
            },
          },
        },
      });

      //todo
    },
  );

  // 3. Delete a directory and replace it with a file.
  await ctx.step("delete directory and replace with file", async () => {
    // Create a directory with one file.
    commits1.gamma = await yan.write(commits1.zero, {
      "/dir/file1.txt": new t.Blob("hello"),
    });

    // Replace the directory with a blob at the same path.
    commits1.delta = await yan.write(commits1.zero, {
      "/dir": new t.Blob("i am not a folder anymore"),
    });

    const diff = await yan.diff(commits1.gamma, commits1.delta);

    assertEquals(diff, {
      remove: {},
      add: {},
      conflict: {
        "/dir": {
          left: {
            kind: "tree",
            hash:
              "45748ff5afae9fd63778f764d5663a0491344fdd77ae858808b4ddd19907be45" as t.Hash<Tree>,
          },
          right: {
            kind: "blob",
            hash:
              "8129795c03d9a221262b62f9a54bdbd8fbb1daa4c113aa593f80b843728ba625" as t.Hash<unknown>,
          },
        },
      },
    });

    //todo
    // const applied = await commits1.gamma.apply(diff);

    // // Verify that reading /dir returns the new blob.
    // assertEquals(
    //   await (await applied.read("/dir")).text(),
    //   "i am not a folder anymore",
    // );
  });

  // 4. Conflict resolution in a nested folder.
  await ctx.step("conflict in nested folder", async () => {
    // Base commit with a file.
    commits1.base = await yan.write(commits1.zero, {
      "/nested/conflict.ts": new t.Blob("base"),
    });

    // Two diverging changes.
    commits1.left = await yan.write(commits1.base, {
      "/nested/conflict.ts": new t.Blob("left change"),
    });
    commits1.right = await yan.write(commits1.base, {
      "/nested/conflict.ts": new t.Blob("right change"),
    });

    const diff = await yan.diff(commits1.left, commits1.right);
    const applied = await yan.apply(commits1.left, diff);

    // Expect a conflict marker in the resulting file.
    assertEquals(
      await (await yan.read(applied, "/nested/conflict.ts")).text(),
      `<<<<<<< HEAD\nleft change\n=======\nright change\n>>>>>>>`,
    );
  });

  await ctx.step("verify head and heads", async () => {
    await yan.push(["foo", "bar", "master"], commits.nine!);
    await yan.push(["foo", "bar", "main"], commits.eight!);
    await yan.push(["foo", "bar", "dev"], commits.seven!);

    assertEquals(
      await yan.head(["foo", "bar", "master"]),
      commits.nine,
    );

    assertEquals(
      await yan.head(["foo", "bar", "main"]),
      commits.eight,
    );

    assertEquals(
      await yan.head(["foo", "bar", "dev"]),
      commits.seven,
    );

    assertEquals(
      await yan.heads([["foo", "bar", "master"], ["foo", "bar", "main"]]),
      [[["foo", "bar", "master"], commits.nine], [
        ["foo", "bar", "main"],
        commits.eight,
      ]],
    );
  });

  await ctx.step({
    name: "verify emojis",
    ignore: true, // diff-match-patch-es encodeURI fails on emoji strings (URI malformed)
    fn: async () => {
      commits.emoji = await yan.write(commits.zero, {
        "/@a": new t.Blob(""),
      });

      assertEquals(
        await (await yan.read(commits.emoji, "/@a")).text(),
        "",
      );

      commits.emoji2 = await yan.write(commits.emoji, {
        "/@a": new t.Blob("🧪';\n "),
      });

      assertEquals(
        await (await yan.read(commits.emoji2, "/@a")).text(),
        "🧪';\n ",
      );

      commits.emoji3 = await yan.write(commits.emoji2, {
        "/@a": new t.Blob("🧪';\n"),
      });

      assertEquals(
        await (await yan.read(commits.emoji3, "/@a")).text(),
        "🧪';\n",
      );
    },
  });
};

Deno.test("yan > commit", async (t) => {
  await t.step("implements interface", test(yan()));
});
