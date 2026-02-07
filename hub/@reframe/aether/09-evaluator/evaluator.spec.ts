import { link } from "../08-linker/block.mock.ts";
import * as t from "./t.ts";
import { evaluator } from "./evaluator.ts";
import { runtimeCtx } from "./ctx.ts";
import { compiler } from "../06-compiler/ts.mock.ts";

const sources: Record<t.Path, string> = {};
const compiled: Record<t.Hash<string>, string> = {};

const blob = t.factory(
  class implements t.blob.BlobStorage {
    async read<T>(hash: t.Hash<T>): Promise<t.Blob<T>> {
      const encoded = compiled[hash as unknown as t.Hash<string>];
      return new t.Blob(atob(encoded)) as t.Blob<T>;
    }
    async write<T>(_blob: t.Blob<T>): Promise<t.Hash<T>> {
      throw new Error("Not implemented");
    }
    async readMany<T>(hashes: t.Hash<T>[]): Promise<[t.Hash<T>, t.Blob<T>][]> {
      return Promise.all(
        hashes.map(async (hash) => [hash, await this.read(hash)] as [t.Hash<T>, t.Blob<T>])
      );
    }
    async resolve<T>(_prefix: t.Hash<T>): Promise<t.Hash<T>> {
      throw new Error("Not implemented");
    }
  },
)();

const evaluatorMock = evaluator(blob)();

// Helper to transform ES module syntax to evaluator-compatible format
// The evaluator uses new Function(source)() which doesn't support ES modules
// So we transform "export default (Module) =>" to "return (Module) =>"
function toEvaluatorFormat(compiled: string): string {
  // Strip sourcemap comment and transform export default to return
  const withoutSourcemap = compiled.split("//# sourceMappingURL")[0];
  return withoutSourcemap.replace(/^export default\s+/, "return ");
}

Deno.test({
  name: "evaluator > link",
  fn: async () => {
    sources["/~yan/()/code.ts"] = `
    function bar(a: number) {
      "use client";
      if (a == 6) {
        return a;
      }
      return foo(a + 1);
    }
    function foo(a: number) {
      "use client";
      return a;
      return bar(a + 1);
    }

    export default function Page() {
      "use client"
      return foo(1);
    }
  `;

  const result = await link({
    entry: {
      specifier: new t.Specifier("yan", "/code.ts", {}),
      export: "default",
      targets: ["client"],
    },
    source: sources,
  });

  for (const [path, content] of Object.entries(sources)) {
    const compileResult = await compiler.compile(
      path as t.Path,
      new t.Blob(content),
      "client",
    );
    // Compute hash from original content (same as linker does)
    const hash = await t.hash<string>(
      new TextEncoder().encode(JSON.stringify(compileResult.content)),
    );
    // But store the evaluator-compatible format
    const evaluatorCode = toEvaluatorFormat(compileResult.content);
    compiled[hash] = btoa(evaluatorCode);
  }

  const runtime = evaluatorMock.runtime(result, new Map());

  runtimeCtx.with(runtime, async () => {
    const x = await runtime.import(
      "client",
      new t.Specifier("yan", "/code.ts", {}),
      "default",
    );

    console.log((x as () => unknown)());
  });
  },
});
