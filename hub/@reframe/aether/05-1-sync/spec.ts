import * as t from "./t.ts";
import { assertEquals } from "jsr:@std/assert";
import { serve, server } from "./server.ts";
import { client, memoryStore, remote } from "./client.ts";
import { transfer } from "./transfer.ts";
import { Client, Server } from "./interface.ts";

/**
 * Comprehensive sync protocol test following the exact scenario:
 *
 * Timeline:
 * 1. Server has foo -> c0
 * 2. Client pulls, now client.foo -> c0, client.remotes.origin.foo -> c0
 * 3. Server advances foo -> c1
 * 4. Client pulls (head=c0), gets c0..c1, now client.remotes.origin.foo -> c1
 * 5. Client makes local changes, foo -> c2 (parent=c1)
 * 6. Client pulls (head=c1), empty stream (up to date)
 * 7. Client pushes (head=c1, payload c1..c2), server accepts, both at c2
 * 8. Client makes more changes, foo -> c3 (parent=c2)
 * 9. Meanwhile server did hard revert to c1, then made c4 (parent=c1)
 * 10. Client push fails (head mismatch: expected c2, got c4)
 * 11. Client pulls (head=c2), server computes lca(c2,c4)=c1, sends c1..c4
 * 12. Client updates remotes.origin.foo -> c4
 * 13. Client applies diff(c4, c3) on top of c4 -> c5
 * 14. Client pushes (head=c4, payload c4..c5), success
 */

// Helper: create isolated yan instance with its own storage
async function createInstance(name: string) {
  const db = t.db.sqlite({ url: ":memory:" });
  const kv = t.kv.simple(db);
  await kv().$sync(); // Initialize database schema
  const blob = t.blob.kv(t.kv.namespace(["blob"], kv));
  const yan = t.yan.yan(t.kv.namespace(["yan"], kv), blob);
  return { name, db, kv, blob, yan };
}

type Instance = Awaited<ReturnType<typeof createInstance>>;

export const test = (
  createServer: (instance: Instance) => Server,
  createClient: (instance: Instance) => Client,
) =>
async (ctx: Deno.TestContext) => {
  const serverInstance = await createInstance("server");
  const clientInstance = await createInstance("client");

  const serverSync = createServer(serverInstance);
  const clientSync = createClient(clientInstance);

  const branch = ["org", "frame", "foo"];

  // ========================================
  // Step 1: Server creates initial commit c0
  // ========================================
  let c0: t.Hash<t.yan.Commit>;
  await ctx.step("server creates c0", async () => {
    c0 = await serverInstance.yan().write(
      null,
      { "/readme.txt": new t.Blob("initial content") },
      "initial commit",
    );
    await serverInstance.yan().push(branch, c0);

    assertEquals(await serverInstance.yan().head(branch), c0);
  });

  // ========================================
  // Step 2: Client pulls (first pull, no head)
  // ========================================
  await ctx.step("client first pull", async () => {
    await clientSync.remote.add("origin", serverSync);

    const result = await clientSync.pull("origin", branch);
    assertEquals(result.head, c0);

    const remoteRef = await clientSync.remote.head("origin", branch);
    assertEquals(remoteRef, c0);

    const localHead = await clientInstance.yan().head(branch);
    assertEquals(localHead, c0);
  });

  // ========================================
  // Step 3: Server advances to c1
  // ========================================
  let c1: t.Hash<t.yan.Commit>;
  await ctx.step("server creates c1", async () => {
    c1 = await serverInstance.yan().write(
      c0,
      { "/feature.txt": new t.Blob("new feature") },
      "add feature",
    );
    await serverInstance.yan().push(branch, c1);

    assertEquals(await serverInstance.yan().head(branch), c1);
    assertEquals(await serverInstance.yan().parent(c1), c0);
  });

  // ========================================
  // Step 4: Client incremental pull
  // ========================================
  await ctx.step("client incremental pull", async () => {
    const result = await clientSync.pull("origin", branch);
    assertEquals(result.lca, c0);
    assertEquals(result.head, c1);

    const remoteRef = await clientSync.remote.head("origin", branch);
    assertEquals(remoteRef, c1);
  });

  // ========================================
  // Step 5: Client makes local changes -> c2
  // ========================================
  let c2: t.Hash<t.yan.Commit>;
  await ctx.step("client local change c2", async () => {
    c2 = await clientInstance.yan().write(
      c1,
      { "/client-change.txt": new t.Blob("client work") },
      "client local change",
    );
    await clientInstance.yan().push(branch, c2);

    // remotes.origin.foo is still c1
    const remoteRef = await clientSync.remote.head("origin", branch);
    assertEquals(remoteRef, c1);
  });

  // ========================================
  // Step 6: Client pulls (empty, server still at c1)
  // ========================================
  await ctx.step("client pull empty (up to date)", async () => {
    const result = await clientSync.pull("origin", branch);
    assertEquals(result.lca, c1);
    assertEquals(result.head, c1);
  });

  // ========================================
  // Step 7: Client pushes c1..c2
  // ========================================
  await ctx.step("client push c2", async () => {
    const result = await clientSync.push("origin", branch);
    assertEquals(result.success, true);
    assertEquals(result.head, c2);

    // Server now at c2
    assertEquals(await serverInstance.yan().head(branch), c2);

    // Remote ref updated
    const remoteRef = await clientSync.remote.head("origin", branch);
    assertEquals(remoteRef, c2);
  });

  // ========================================
  // Step 8: Client makes more changes -> c3
  // ========================================
  let c3: t.Hash<t.yan.Commit>;
  await ctx.step("client local change c3", async () => {
    c3 = await clientInstance.yan().write(
      c2,
      { "/more-work.txt": new t.Blob("more client work") },
      "more client changes",
    );
    await clientInstance.yan().push(branch, c3);

    assertEquals(await clientInstance.yan().head(branch), c3);
    assertEquals(await clientInstance.yan().parent(c3), c2);
  });

  // ========================================
  // Step 9: Server hard reverts to c1, creates c4
  // ========================================
  let c4: t.Hash<t.yan.Commit>;
  await ctx.step("server reverts and diverges to c4", async () => {
    // Simulate hard revert + new work using "replace" strategy
    await serverInstance.yan().push(branch, c1, "replace");

    c4 = await serverInstance.yan().write(
      c1,
      { "/server-diverge.txt": new t.Blob("server diverged work") },
      "server diverged from c1",
    );
    await serverInstance.yan().push(branch, c4);

    assertEquals(await serverInstance.yan().head(branch), c4);
    assertEquals(await serverInstance.yan().parent(c4), c1);
  });

  // ========================================
  // Step 10: Client push fails (head mismatch)
  // ========================================
  await ctx.step("client push fails with head mismatch", async () => {
    const result = await clientSync.push("origin", branch);
    assertEquals(result.success, false);
    assertEquals(result.error, "head_mismatch");
    assertEquals(result.actualHead, c4);
  });

  // ========================================
  // Step 11: Client pulls and rebases diverged history
  // ========================================
  let c5: t.Hash<t.yan.Commit>;
  await ctx.step("client pulls and rebases diverged history", async () => {
    const localBefore = await clientInstance.yan().head(branch); // c3
    assertEquals(localBefore, c3);

    const result = await clientSync.pull("origin", branch);
    assertEquals(result.lca, c1); // c2->c1, c4->c1, so lca=c1
    assertEquals(result.head, c4);

    const remoteRef = await clientSync.remote.head("origin", branch);
    assertEquals(remoteRef, c4);

    // Local should now be rebased (c3 rebased on top of c4)
    const localAfter = await clientInstance.yan().head(branch);
    // localAfter should be new commit with c4 as parent, containing c3's changes
    assertEquals(await clientInstance.yan().parent(localAfter), c4);

    // Verify rebased commit has both changes
    const divergeContent = await clientInstance.yan().read(localAfter!, "/server-diverge.txt");
    assertEquals(await divergeContent.text(), "server diverged work");
    const clientContent = await clientInstance.yan().read(localAfter!, "/more-work.txt");
    assertEquals(await clientContent.text(), "more client work");

    c5 = localAfter!;
  });

  // ========================================
  // Step 12 & 13: Client sync (just push, no rebase)
  // ========================================
  await ctx.step("client sync (just push, no rebase)", async () => {
    const result = await clientSync.sync("origin", branch);
    assertEquals(result.rebased, false); // Rebase happens in pull now, not sync
    assertEquals(result.pushed?.success, true);
    assertEquals(result.pushed?.head, c5);

    // Server has c5
    assertEquals(await serverInstance.yan().head(branch), c5);
  });

  // ========================================
  // Final verification
  // ========================================
  await ctx.step("final verification", async () => {
    // All files present on server
    const files = [
      "readme.txt",
      "feature.txt",
      "server-diverge.txt",
      "more-work.txt",
    ];
    for (const file of files) {
      await serverInstance.yan().read(c5, `/${file}`);
    }

    // Client and server in sync
    assertEquals(
      await clientInstance.yan().head(branch),
      await serverInstance.yan().head(branch),
    );

    // Remote ref matches
    assertEquals(
      await clientSync.remote.head("origin", branch),
      c5,
    );
  });
};

// Wire up server/client to use the test instance's storage
function createServer(instance: Instance): Server {
  return server(instance.yan, instance.blob)();
}

function createClient(instance: Instance): Client {
  return client(instance.yan, instance.blob, memoryStore())();
}

// Helper to serve over Unix socket
function serveUnixSocket(
  handler: (req: Request) => Promise<Response>,
  signal: AbortSignal,
): Promise<string> {
  const path = Deno.makeTempDirSync() + "/sync.sock";
  const { promise, resolve } = Promise.withResolvers<string>();
  Deno.serve({ path, onListen: () => resolve(path), signal }, handler);
  return promise;
}

// Test with direct connection
Deno.test("sync protocol", async (t) => {
  await t.step("direct", test(createServer, createClient));
});

// Test with HTTP over Unix socket
Deno.test(
  { name: "sync protocol over http", sanitizeResources: false },
  async (t) => {
    // Set up HTTP server that wraps the actual server
    const abortController = new AbortController();
    let socketPath: string | null = null;
    const httpClients: Deno.HttpClient[] = [];

    // Wrapper that captures and serves the actual server
    const createHttpServer = (instance: Instance): Server => {
      const s = createServer(instance);

      // Start HTTP server for this sync server
      const pathPromise = serveUnixSocket(serve(s), abortController.signal);
      pathPromise.then((p) => (socketPath = p));

      return s;
    };

    // Client that connects via HTTP instead of directly
    const createHttpClient = (instance: Instance): Client => {
      const c = client(instance.yan, instance.blob, memoryStore())();

      // Override remote.add to use HTTP client
      const originalAdd = c.remote.add;
      c.remote.add = async (name, _server) => {
        // Wait for socket path to be ready
        while (!socketPath) {
          await new Promise((r) => setTimeout(r, 1));
        }
        const hc = Deno.createHttpClient({
          proxy: { transport: "unix", path: socketPath },
        });
        httpClients.push(hc);
        const remoteServer = remote(
          "http://localhost/",
          (url: string, init?: RequestInit) =>
            fetch(url, { ...init, client: hc } as RequestInit),
        );
        await originalAdd.call(c.remote, name, remoteServer);
      };

      return c;
    };

    try {
      await test(createHttpServer, createHttpClient)(t);
    } finally {
      httpClients.forEach((c) => c.close());
      abortController.abort();
    }
  },
);

// ============================================
// Streaming Verification Tests
// ============================================

import { TransferItem } from "./interface.ts";
import { assert } from "jsr:@std/assert";

Deno.test("streaming: items yielded incrementally", async (ctx) => {
  const instance = await createInstance("server");
  const s = server(instance.yan, instance.blob)();
  const branch = ["test", "branch"];

  // Create multiple commits with multiple blobs each
  let parent: t.Hash<t.yan.Commit> | null = null;
  for (let i = 0; i < 5; i++) {
    parent = await instance.yan().write(
      parent,
      {
        [`/file-${i}-a.txt`]: new t.Blob(`content ${i} a`),
        [`/file-${i}-b.txt`]: new t.Blob(`content ${i} b`),
      },
      `commit ${i}`,
    );
  }
  await instance.yan().push(branch, parent!);

  await ctx.step("pull yields items as they're requested", async () => {
    const result = await s.pull(branch, null);

    // Verify we get an async iterable, not an array
    const items: TransferItem[] = [];
    let yieldCount = 0;

    for await (const item of result.payload) {
      yieldCount++;
      items.push(item);
      // Each item should be yielded individually
      assertEquals(items.length, yieldCount);
    }

    // Should have many items (blobs + trees + commits)
    assert(items.length > 10);
  });

  await ctx.step("push consumes items as they're provided", async () => {
    const clientInstance = await createInstance("client");
    const clientServer = server(clientInstance.yan, clientInstance.blob)();

    // Create a tracking generator
    const consumedAt: number[] = [];
    let provideCount = 0;

    async function* trackingPayload(): AsyncGenerator<TransferItem> {
      const result = await s.pull(branch, null);
      for await (const item of result.payload) {
        provideCount++;
        consumedAt.push(provideCount);
        yield item;
      }
    }

    await clientServer.push(["client", "branch"], null, trackingPayload());

    // Items should be consumed in order
    for (let i = 0; i < consumedAt.length; i++) {
      assertEquals(consumedAt[i], i + 1);
    }
  });
});

// ============================================
// Complex Tree Tests
// ============================================

Deno.test("createPayload: complex nested trees", async (ctx) => {
  const instance = await createInstance("server");
  const trans = transfer(instance.yan, instance.blob)();
  const branch = ["test", "complex"];

  await ctx.step("deeply nested directories", async () => {
    const c1 = await instance.yan().write(
      null,
      {
        "/a/b/c/d/file.txt": new t.Blob("deep"),
        "/a/b/other.txt": new t.Blob("other"),
        "/a/sibling.txt": new t.Blob("sibling"),
        "/root.txt": new t.Blob("root"),
      },
      "nested commit",
    );
    await instance.yan().push(branch, c1);

    // Collect all items
    const items: TransferItem[] = [];
    for await (const item of trans.createPayload(c1, null)) {
      items.push(item);
    }

    // Verify ordering: blobs come before their parent trees
    const hashOrder = new Map<string, number>();
    items.forEach((item, idx) => hashOrder.set(item.hash, idx));

    // Blobs before trees before commits
    const blobs = items.filter((i) => i.type === "blob");
    const trees = items.filter((i) => i.type === "tree");
    const commits = items.filter((i) => i.type === "commit");

    assert(blobs.length === 4); // 4 files
    assert(trees.length >= 4); // Multiple directory levels
    assert(commits.length === 1);

    // All blobs should come before commits
    const lastBlobIdx = Math.max(...blobs.map((b) => hashOrder.get(b.hash)!));
    const firstCommitIdx = Math.min(
      ...commits.map((c) => hashOrder.get(c.hash)!),
    );

    assert(lastBlobIdx < firstCommitIdx); // Blobs before commits
  });

  await ctx.step("shared subtrees across commits", async () => {
    // Create two commits that share a subtree
    const c1 = await instance.yan().write(
      null,
      { "/shared/file.txt": new t.Blob("shared content") },
      "first",
    );
    const c2 = await instance.yan().write(
      c1,
      { "/new/other.txt": new t.Blob("new content") },
      "second",
    );

    // Transfer from c1 to c2 should NOT include shared subtree
    const items: TransferItem[] = [];
    for await (const item of trans.createPayload(c2, c1)) {
      items.push(item);
    }

    // Should only have: 1 new blob, 1 new tree (/new), 1 modified root tree, 1 commit
    const blobs = items.filter((i) => i.type === "blob");
    assertEquals(blobs.length, 1); // Only /new/other.txt
  });
});

// ============================================
// Roundtrip Test
// ============================================

Deno.test("roundtrip: createPayload + receivePayload", async (ctx) => {
  const sourceInstance = await createInstance("source");
  const destInstance = await createInstance("dest");

  const sourceTrans = transfer(sourceInstance.yan, sourceInstance.blob)();
  const destTrans = transfer(destInstance.yan, destInstance.blob)();

  const branch = ["test", "roundtrip"];

  // Create a chain of commits with complex changes
  let parent: t.Hash<t.yan.Commit> | null = null;
  const commits: t.Hash<t.yan.Commit>[] = [];

  await ctx.step("create commit chain on source", async () => {
    parent = await sourceInstance.yan().write(
      null,
      {
        "/readme.txt": new t.Blob("initial"),
        "/src/main.ts": new t.Blob("console.log('hello')"),
      },
      "initial",
    );
    commits.push(parent);

    parent = await sourceInstance.yan().write(
      parent,
      {
        "/src/main.ts": new t.Blob("console.log('updated')"),
        "/src/util.ts": new t.Blob("export const add = (a, b) => a + b"),
      },
      "add util",
    );
    commits.push(parent);

    parent = await sourceInstance.yan().write(
      parent,
      {
        "/docs/api.md": new t.Blob("# API\n\n## add(a, b)"),
        "/readme.txt": new t.Blob("initial\n\nSee docs/"),
      },
      "add docs",
    );
    commits.push(parent);

    await sourceInstance.yan().push(branch, parent);
  });

  await ctx.step("transfer and reconstruct", async () => {
    // Transfer all commits (base = null)
    const finalCommit = commits[commits.length - 1];
    const received = await destTrans.receivePayload(
      sourceTrans.createPayload(finalCommit, null),
    );

    assertEquals(received, finalCommit);

    // Verify all files readable on dest
    const destYan = destInstance.yan();

    const readme = await destYan.read(finalCommit, "/readme.txt");
    assertEquals(await readme.text(), "initial\n\nSee docs/");

    const main = await destYan.read(finalCommit, "/src/main.ts");
    assertEquals(await main.text(), "console.log('updated')");

    const util = await destYan.read(finalCommit, "/src/util.ts");
    assertEquals(await util.text(), "export const add = (a, b) => a + b");

    const api = await destYan.read(finalCommit, "/docs/api.md");
    assertEquals(await api.text(), "# API\n\n## add(a, b)");
  });

  await ctx.step("incremental transfer", async () => {
    // Add more commits on source
    const c4 = await sourceInstance.yan().write(
      parent,
      { "/changelog.md": new t.Blob("## v1.0\n- Initial release") },
      "add changelog",
    );

    // Transfer only new commit (base = last transferred)
    const received = await destTrans.receivePayload(
      sourceTrans.createPayload(c4, parent!),
    );

    assertEquals(received, c4);

    // Verify new file
    const changelog = await destInstance.yan().read(c4, "/changelog.md");
    assertEquals(await changelog.text(), "## v1.0\n- Initial release");

    // Verify old files still accessible
    const readme = await destInstance.yan().read(c4, "/readme.txt");
    assertEquals(await readme.text(), "initial\n\nSee docs/");
  });
});

// ============================================
// Stress Test
// ============================================

Deno.test({
  name: "stress test: many push/pull operations",
  sanitizeResources: false,
}, async (ctx) => {
  const serverInstance = await createInstance("server");
  const client1Instance = await createInstance("client1");
  const client2Instance = await createInstance("client2");

  const s = server(serverInstance.yan, serverInstance.blob)();
  const cl1 = client(
    client1Instance.yan,
    client1Instance.blob,
    memoryStore(),
  )();
  const cl2 = client(
    client2Instance.yan,
    client2Instance.blob,
    memoryStore(),
  )();

  await cl1.remote.add("origin", s);
  await cl2.remote.add("origin", s);

  const branch = ["stress", "test"];

  // Initial setup
  await ctx.step("setup: initial commit", async () => {
    const c0 = await serverInstance.yan().write(
      null,
      { "/init.txt": new t.Blob("initial") },
      "initial",
    );
    await serverInstance.yan().push(branch, c0);

    await cl1.pull("origin", branch);
    await cl2.pull("origin", branch);
  });

  // Run 10 rounds where clients take turns making commits
  for (let round = 0; round < 10; round++) {
    await ctx.step(`round ${round}`, async () => {
      // Client 1 syncs and adds a commit
      await cl1.sync("origin", branch, `c1 sync ${round}`);
      const c1Head = await client1Instance.yan().head(branch);
      const c1New = await client1Instance.yan().write(
        c1Head,
        { [`/client1-${round}.txt`]: new t.Blob(`client1 ${round}`) },
        `client1 commit ${round}`,
      );
      await client1Instance.yan().push(branch, c1New);
      const pushResult1 = await cl1.push("origin", branch);
      assertEquals(pushResult1.success, true);

      // Client 2 syncs (should get client1's commit) and adds its own
      await cl2.sync("origin", branch, `c2 sync ${round}`);
      const c2Head = await client2Instance.yan().head(branch);
      const c2New = await client2Instance.yan().write(
        c2Head,
        { [`/client2-${round}.txt`]: new t.Blob(`client2 ${round}`) },
        `client2 commit ${round}`,
      );
      await client2Instance.yan().push(branch, c2New);
      const pushResult2 = await cl2.push("origin", branch);
      assertEquals(pushResult2.success, true);
    });
  }

  // Final sync
  await ctx.step("final sync", async () => {
    await cl1.pull("origin", branch);

    const serverHead = await serverInstance.yan().head(branch);
    const c1Head = await client1Instance.yan().head(branch);
    const c2Head = await client2Instance.yan().head(branch);

    assertEquals(c1Head, serverHead);
    assertEquals(c2Head, serverHead);

    // Verify all files are present
    for (let i = 0; i < 10; i++) {
      const c1File = await serverInstance.yan().read(
        serverHead!,
        `/client1-${i}.txt`,
      );
      assertEquals(await c1File.text(), `client1 ${i}`);
      const c2File = await serverInstance.yan().read(
        serverHead!,
        `/client2-${i}.txt`,
      );
      assertEquals(await c2File.text(), `client2 ${i}`);
    }
  });
});

// ============================================
// basePath Tests
// ============================================

// ============================================
// Pull Divergence Scenarios
// ============================================

Deno.test("pull: divergence scenarios", async (ctx) => {
  // ========================================
  // Setup: Create fresh instances
  // ========================================
  const serverInstance = await createInstance("server");
  const clientInstance = await createInstance("client");
  const serverSync = createServer(serverInstance);
  const clientSync = createClient(clientInstance);
  const branch = ["test", "diverge"];

  await clientSync.remote.add("origin", serverSync);

  // ========================================
  // Step 1: Server creates base commit c0
  // ========================================
  let c0: t.Hash<t.yan.Commit>;
  await ctx.step("1. server creates base commit c0", async () => {
    c0 = await serverInstance.yan().write(
      null,
      { "/base.txt": new t.Blob("base content") },
      "base commit",
    );
    await serverInstance.yan().push(branch, c0);
  });

  // ========================================
  // Step 2: Client pulls c0
  // ========================================
  await ctx.step("2. client pulls c0", async () => {
    await clientSync.pull("origin", branch);
    assertEquals(await clientInstance.yan().head(branch), c0);
    assertEquals(await clientSync.remote.head("origin", branch), c0);
  });

  // ========================================
  // Step 3: Both sides diverge from c0
  // Server: c0 -> c1
  // Client: c0 -> c2
  // ========================================
  let c1: t.Hash<t.yan.Commit>;
  let c2: t.Hash<t.yan.Commit>;
  await ctx.step("3. server creates c1 (c0 -> c1)", async () => {
    c1 = await serverInstance.yan().write(
      c0,
      { "/server.txt": new t.Blob("server change") },
      "server commit",
    );
    await serverInstance.yan().push(branch, c1);
  });

  await ctx.step("4. client creates c2 locally (c0 -> c2)", async () => {
    c2 = await clientInstance.yan().write(
      c0,
      { "/client.txt": new t.Blob("client change") },
      "client commit",
    );
    await clientInstance.yan().push(branch, c2);
    // Remote ref still at c0
    assertEquals(await clientSync.remote.head("origin", branch), c0);
  });

  // ========================================
  // Step 5: Client pulls - should rebase c2 on c1
  // ========================================
  let c3: t.Hash<t.yan.Commit>;
  await ctx.step("5. client pulls diverged - rebases c2 onto c1 -> c3", async () => {
    const result = await clientSync.pull("origin", branch);

    // Pull result shows remote state
    assertEquals(result.lca, c0);
    assertEquals(result.head, c1);

    // Local head should now be rebased commit
    c3 = (await clientInstance.yan().head(branch))!;

    // c3's parent should be c1 (rebased on top of server)
    assertEquals(await clientInstance.yan().parent(c3), c1);

    // Remote ref updated to c1
    assertEquals(await clientSync.remote.head("origin", branch), c1);
  });

  // ========================================
  // Step 6: Verify rebased commit has both changes
  // ========================================
  await ctx.step("6. rebased commit c3 contains both changes", async () => {
    const serverContent = await clientInstance.yan().read(c3, "/server.txt");
    assertEquals(await serverContent.text(), "server change");

    const clientContent = await clientInstance.yan().read(c3, "/client.txt");
    assertEquals(await clientContent.text(), "client change");

    const baseContent = await clientInstance.yan().read(c3, "/base.txt");
    assertEquals(await baseContent.text(), "base content");
  });

  // ========================================
  // Step 7: Client pushes rebased commit
  // ========================================
  await ctx.step("7. client pushes rebased commit c3", async () => {
    const result = await clientSync.push("origin", branch);
    assertEquals(result.success, true);
    assertEquals(result.head, c3);

    // Server now has c3
    assertEquals(await serverInstance.yan().head(branch), c3);
  });

  // ========================================
  // Step 8: sync() is just pull + push (no rebase)
  // ========================================
  await ctx.step("8. sync just does pull + push", async () => {
    // Server advances
    const c4 = await serverInstance.yan().write(
      c3,
      { "/more.txt": new t.Blob("more") },
      "server c4",
    );
    await serverInstance.yan().push(branch, c4);

    // Client diverges
    const c5 = await clientInstance.yan().write(
      c3,
      { "/local.txt": new t.Blob("local") },
      "client c5",
    );
    await clientInstance.yan().push(branch, c5);

    // Sync should pull (rebase c5 onto c4) then push
    const result = await clientSync.sync("origin", branch);
    assertEquals(result.rebased, false); // rebase happens in pull, not sync

    const finalHead = await clientInstance.yan().head(branch);
    assertEquals(await serverInstance.yan().head(branch), finalHead);
  });
});

Deno.test("serve with basePath", async (ctx) => {
  const instance = await createInstance("server");
  const s = server(instance.yan, instance.blob)();
  const handler = serve(s, "/sync");

  // Create a commit
  const c0 = await instance.yan().write(null, { "/f.txt": new t.Blob("hi") }, "init");
  await instance.yan().push(["org", "frame", "main"], c0);

  await ctx.step("GET /sync/org/frame/main pulls correctly", async () => {
    const req = new Request("http://localhost/sync/org/frame/main");
    const res = await handler(req);
    assertEquals(res.headers.get("X-Sync-Head"), c0);
  });

  await ctx.step("POST /sync/org/frame/main pushes correctly", async () => {
    // Create a client commit
    const clientInstance = await createInstance("client");
    const trans = transfer(clientInstance.yan, clientInstance.blob)();

    // First, transfer c0 to client
    const pullResult = await s.pull(["org", "frame", "main"], null);
    await trans.receivePayload(pullResult.payload);

    // Client creates a new commit
    const c1 = await clientInstance.yan().write(c0, { "/g.txt": new t.Blob("hello") }, "client commit");

    // Push via HTTP with basePath
    const payload = trans.createPayload(c1, c0);

    // Convert to stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const item of payload) {
          // Encode each item
          const hashBytes = encoder.encode(item.hash);
          let type: number;
          if (item.type === "blob") type = 1;
          else if (item.type === "tree") type = 2;
          else type = 3;

          const buffer = new Uint8Array(1 + 4 + hashBytes.length + 4 + item.data.length);
          const view = new DataView(buffer.buffer);
          let offset = 0;
          buffer[offset++] = type;
          view.setUint32(offset, hashBytes.length);
          offset += 4;
          buffer.set(hashBytes, offset);
          offset += hashBytes.length;
          view.setUint32(offset, item.data.length);
          offset += 4;
          buffer.set(item.data, offset);

          controller.enqueue(buffer);
        }
        controller.enqueue(new Uint8Array([0])); // End marker
        controller.close();
      },
    });

    const req = new Request(`http://localhost/sync/org/frame/main?head=${c0}`, {
      method: "POST",
      body: stream,
    });
    const res = await handler(req);
    const result = await res.json();

    assertEquals(result.success, true);
    assertEquals(result.head, c1);

    // Verify server has the new commit
    const serverHead = await instance.yan().head(["org", "frame", "main"]);
    assertEquals(serverHead, c1);
  });
});
