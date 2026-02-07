import * as t from "./t.ts";
import { bundler, serve as serve_ } from "./serve.ts";
import { LruCache, memoize, TtlCache } from "jsr:@std/cache";

const compiler = t.compiler.ts();

const db = t.db.sqlite({ url: "./data/truth.db" });
const kv = t.kv.simple(db);
const blob = t.blob.kv(t.kv.namespace(["blob"], kv));
const cache = t.cache.kv(t.kv.namespace(["cache"], kv));

const yan = t.yan.yan(t.kv.namespace(["yan"], kv), blob);

const createCtx = memoize(async (ctx: {
  org: string;
  frame: string;
  branch: string;
  config: t.Hash<t.Config>;
}) => {
  const branchHead = await yan().head([ctx.org, ctx.frame, ctx.branch]);
  const head = branchHead ?? await yan().head(ctx.branch);
  const detached = branchHead === null;

  if (!head) {
    throw new t.yan.BranchNotFoundSurprise({
      name: [ctx.org, ctx.frame, ctx.branch],
    });
  }

  const tree = await yan().tree(head);
  const workingTree = yan().workingTree(tree);

  const [snapshot, packageManager] = await Promise.all([
    t.server.createSnapshot(yan(), workingTree),
    createPackageManager(tree, workingTree),
  ]);

  return {
    ...ctx,
    head,
    detached,
    workingTree,
    bundler,
    snapshot,
    packageManager,
  };
}, {
  getKey: ({ org, frame, branch, config }) =>
    `${org}/${frame}/${branch}/${config}`,
  // cache this branch for 100ms
  // later, replace cache time for createCtx with swr
  // and increase for createSnapshot (~1000ms)
  // on that note, packageManager would need access to the ctx
  // to be able to access the snapshot without directly
  // accessing reframe.json
  cache: new TtlCache<any, any>(100),
});

const createPackageManager = memoize(
  async (_tree: t.Hash<t.yan.Tree>, workingTree: t.yan.WorkingTree) => {
    const version = 3;

    const registry = t.npm.npm({
      workingTree,
      cdn: Deno.env.get("ESM_CDN") ?? "https://esm.sh",
      cache,
      yan,
    });

    const prevGraph = await workingTree.read("/~/deps.lock")
      .then(async (blob) => {
        const graph = await blob.json() as t.npm.Graph;

        if (graph.version !== version) {
          throw new t.reader.VersionMismatchSurprise({
            expected: version,
            actual: graph.version,
          });
        }

        return graph;
      })
      .catch((e) => {
        if (
          !(e instanceof t.yan.NotFoundSurprise) &&
          !(e instanceof t.reader.VersionMismatchSurprise)
        ) {
          throw e;
        }

        return ({
          version,
          dependencies: {},
          packages: {},
          snapshots: {},
          staging: {},
        }) as t.npm.Graph;
      });

    return new t.npm.PackageManager(registry(), prevGraph);
  },
  {
    getKey: (tree, workingTree) => tree,
    // store maximum 1000 graphs in memory
    cache: new LruCache<any, any>(1000),
  },
);

export const ctx = t.context.create(
  (
    ctx: {
      org: string;
      frame: string;
      branch: string;
      config: t.Hash<t.Config>;
    },
  ) => {
    return createCtx(ctx);
  },
);

const reader = t.reader.compiler(
  t.reader.yan(
    t.reader.npm({ ctx, yan }),
    { ctx },
  ),
  { ctx, yan, blob, compiler },
);

const linker = t.linker.block();
const evaluator = t.evaluator.evaluator(blob);
const typescript = t.lang.typescript(reader, "@/app.tsx");

const version = Deno.env.get("AETHER_VERSION") ?? "master";

export const aether = t.server.aether(evaluator, {
  ctx,
  yan,
  reader,
  linker,
  blob,
  typescript,
  branch: version,
});

export const serve = () => {
  console.log(`[aether] starting version: ${version}`);
  return serve_(
    { port: 8001 },
    (request: Request) => aether().fetch(request),
  );
};

if (import.meta.main) {
  await kv().$sync();
  await serve();
}
