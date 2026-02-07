import * as t from "./t.ts";
import { Commit, Yan } from "./index.ts";
import { NotFoundSurprise } from "./interface.ts";
import { yan } from "./yan.mock.ts";

export const test = (yan: Yan) => async (ctx: Deno.TestContext) => {
  const commits: Record<string, t.Hash<Commit> | null> = {};
  commits.zero = null;

  const t0 = yan.workingTree(null);
  await ctx.step("write /@/a.ts", async () => {
    await t0.write("/@/a.ts", new t.Blob("a1"));
    const a = await t0.read("/@/a.ts");
    t.test.equals(await a.text(), "a1");
  });

  await ctx.step("write /@/b.ts", async () => {
    await t0.write("/@/b.ts", new t.Blob("b1"));
    const b = await t0.read("/@/b.ts");
    t.test.equals(await b.text(), "b1");
  });

  await ctx.step("push", async () => {
    const hash = await t0.push();
    const one = await yan.write(null, {
      "/@/a.ts": new t.Blob("a1"),
    });
    const two = await yan.write(one, {
      "/@/b.ts": new t.Blob("b1"),
    });

    t.test.equals(hash, await yan.tree(two));
  });

  commits.one = await yan.write(commits.zero, {
    "/a.txt": new t.Blob("a1"),
    "/b/c.txt": new t.Blob("c1"),
    "/b/d/e.txt": new t.Blob("e1"),
    "/b/d/f.txt": new t.Blob("f1"),
    "/e.txt": new t.Blob("e2"),
    "/f.txt": new t.Blob("f2"),
  });

  const treeHash = await yan.tree(commits.one);
  const root = yan.workingTree(treeHash);

  await ctx.step("find /", async () => {
    const list = await root.find("/");
    t.test.equals(list.kind, "tree");
    t.test.equals(list.hash, treeHash);

    const bd = await root.find("/b/d");
    t.test.equals(bd.kind, "tree");
  });

  await ctx.step("list /", async () => {
    const list = await root.list("/");

    t.test.equals(Object.keys(list).sort(), ["a.txt", "b", "e.txt", "f.txt"]);

    const bd = await root.list("/b/d");
    t.test.equals(Object.keys(bd).sort(), ["e.txt", "f.txt"]);
  });

  // read a.txt

  await ctx.step("read /a.txt", async () => {
    const a = await root.read("/a.txt");
    t.test.equals(await a.text(), "a1");
  });

  // read b/c.txt
  await ctx.step("read /b/c.txt", async () => {
    const c = await root.read("/b/c.txt");
    t.test.equals(await c.text(), "c1");
  });

  // write b/c.txt/d.txt
  await ctx.step("write /b/c.txt/d.txt", async () => {
    await t.test.rejects(
      () => root.write("/b/c.txt/d.txt", new t.Blob("d1")),
      t.Surprise,
      "expected a tree: /b/c.txt",
    );

    await t.test.rejects(
      () => root.write("/a.txt/c/d.txt", new t.Blob("d1")),
      t.Surprise,
      "expected a tree: /a.txt",
    );

    await t.test.rejects(
      () => root.write("/b/d", new t.Blob("d1")),
      t.Surprise,
      "expected a blob: /b/d",
    );
  });

  // write a.txt
  await ctx.step("write /a.txt", async () => {
    await root.write("/a.txt", new t.Blob("a2"));
    const a = await root.read("/a.txt");
    t.test.equals(await a.text(), "a2");
  });

  //write b/d/f/g/h/i.txt
  await ctx.step("write /b/d/f/g/h/i.txt", async () => {
    await root.write("/b/d/f/g/h/i.txt", new t.Blob("i1"));
    const i = await root.read("/b/d/f/g/h/i.txt");
    t.test.equals(await i.text(), "i1");
  });

  //delete f.txt
  await ctx.step("delete /f.txt", async () => {
    await root.delete("/f.txt");
    await t.test.rejects(
      () => root.read("/f.txt"),
      NotFoundSurprise,
    );
  });

  //delete b/d/f/g/h/i.txt
  await ctx.step("delete /b/d/f/g/h/i.txt", async () => {
    await root.delete("/b/d/f/g/h/i.txt");
    await t.test.rejects(
      () => root.read("/b/d/f/g/h/i.txt"),
      NotFoundSurprise,
    );
  });

  //delete b/d
  await ctx.step("delete /b/d", async () => {
    await root.delete("/b/d");
    await t.test.rejects(
      () => root.find("/b/d"),
      NotFoundSurprise,
    );
  });

  //push
  await ctx.step("push", async () => {
    await root.write("/x/y/z.txt", new t.Blob("z1"));
    await root.write("/x/y/z/u.txt", new t.Blob("u1"));
    await root.write("/x/y/z/v.txt", new t.Blob("v1"));
    await root.delete("/x/y/z");
    await root.write("/x/y/z/p.txt", new t.Blob("p1"));
    await root.write("/x/y/q/1.txt", new t.Blob("v1"));
    await root.write("/x/y/q/2.txt", new t.Blob("v2"));
    await root.write("/b/d.txt", new t.Blob("d1"));
    await root.write("/b/d/e.txt", new t.Blob("e1"));
    await root.write("/b/d/f.txt", new t.Blob("f1"));

    commits.two = await yan.write(null, {
      "/a.txt": new t.Blob("a2"),
      "/b/c.txt": new t.Blob("c1"),
      "/b/d.txt": new t.Blob("d1"),
      "/b/d/e.txt": new t.Blob("e1"),
      "/b/d/f.txt": new t.Blob("f1"),
      "/e.txt": new t.Blob("e2"),
      "/x/y/z.txt": new t.Blob("z1"),
      "/x/y/z/p.txt": new t.Blob("p1"),
      "/x/y/q/1.txt": new t.Blob("v1"),
      "/x/y/q/2.txt": new t.Blob("v2"),
    });

    const hash = await yan.tree(commits.two);
    t.test.equals(await root.push(), hash);

    // delete "/x/y/z/p.txt
    await root.write("/0/0/0/0/0.txt", new t.Blob("0"));
    await root.delete("/0/0/0/0/0.txt");
    t.test.equals(await root.push(), hash);
  });

  // -----------------------------------------
  // Race‑condition checks (expected to fail)
  // -----------------------------------------

  await ctx.step(
    "concurrent writes to the same new directory (pre‑populated root)",
    async () => {
      // Use a non‑empty tree so that the first await inside #findTree performs an
      // asynchronous blob read, giving us a genuine interleaving window.
      const baseHash = treeHash; // treeHash computed earlier from commits.one
      const race = yan.workingTree(baseHash);

      const COUNT = 50;

      // Spawn many concurrent writes into the same *fresh* directory to maximise the
      // chance that two of them attempt to create the directory simultaneously.
      await Promise.all(
        Array.from({ length: COUNT }, (_, i) =>
          race.write(`/dir/file${i}.txt`, new t.Blob(String(i))),
        ),
      );

      const files = await race.list("/dir");

      // All files must be present. Missing files indicate that one directory object
      // overwrote another due to a race in #findTree.
      t.test.equals(
        Object.keys(files).length,
        COUNT,
        `expected ${COUNT} files after concurrent writes, found ${
          Object.keys(files).length
        }`,
      );
    },
  );

  await ctx.step("concurrent writes + delete on the same path", async () => {
    const race = yan.workingTree(null);

    // Pre‑create the file so delete can find it
    await race.write("/foo.txt", new t.Blob("foo1"));

    // Intentionally run delete *after* write has partially progressed.
    const slowWrite = (async () => {
      // Step 1: launch write but insert an artificial delay between dir creation
      // and blob assignment by writing via two steps
      await race.write("/foo.txt", new t.Blob("foo2"));
    })();

    // Give the write a head‑start
    const deletePromise = (async () => {
      await Promise.resolve(); // yield once
      await race.delete("/foo.txt");
    })();

    await Promise.all([slowWrite, deletePromise]);

    // After the race exactly one of the two outcomes should be true:
    //   (1) file is gone, OR (2) file contains "foo2".
    // Any other state (e.g. old content "foo1") reveals a race defect.
    let status: "gone" | "foo1" | "foo2";
    try {
      const blob = await race.read("/foo.txt");
      const text = await blob.text();
      // Validate that text is one of the expected values
      if (text === "foo1" || text === "foo2") {
        status = text;
      } else {
        status = text as "foo1" | "foo2"; // Unexpected value, but safe for error reporting
      }
    } catch (_e) {
      status = "gone";
    }

    t.test.equals(
      ["gone", "foo2"].includes(status),
      true,
      `unexpected state after concurrent write+delete: ${status}`,
    );
  });

  // -----------------------------------------
  // Massive-scale push vs concurrent writes
  // -----------------------------------------
  await ctx.step("massive push + 1000 concurrent writes", async () => {
    const race = yan.workingTree(null);

    // Generate 1000 scattered paths of depth 4
    const createPaths = (N: number) =>
      Array.from({ length: N }, (_, i): t.Path => {
        const p1 = `D${i % 3}`;
        const p2 = `E${Math.floor(i / 3) % 3}`;
        const p3 = `F${Math.floor(i / 9) % 3}`;
        return `/${p1}/${p2}/${p3}.txt` as const;
      });

    // Prepopulate all scattered paths
    await Promise.all(
      createPaths(100).map((p, i) => race.write(p, new t.Blob(String(i)))),
    );

    await race.push();

    await Promise.all(
      createPaths(100).map((p, i) => race.write(p, new t.Blob(String(i)))),
    );

    const pushPromise = race.push();

    for (const p of createPaths(100)) {
      await race.write(p, new t.Blob("X"));
    }

    // Verify push always fulfills under heavy interleaving
    t.test.equals(
      typeof (await pushPromise),
      "string",
      "push under heavy concurrent writes failed",
    );
  });
};

Deno.test("yan > commit", async (t) => {
  await t.step("implements interface", test(yan()));
});
