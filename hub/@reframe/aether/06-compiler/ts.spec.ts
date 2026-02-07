import { assertEquals } from "jsr:@std/assert";
import * as t from "./t.ts";
import { ts } from "./index.ts";
import { format } from "npm:prettier";

const unindent = (source: string) => {
  const lines = source.split("\n");
  // expect first line to be empty
  while (lines[0]?.trim() === "") {
    lines.shift();
  }

  const indent = lines[0]?.match(/^\s*/)?.[0] ?? "";

  const out = lines
    .map((line) =>
      line
        .replace(indent, "")
        .replace(/^\s*$/, "")
    );

  while (out[out.length - 1]?.trim() === "") {
    out.pop();
  }

  return out;
};

const fmt = async (code: string) => {
  return unindent(
    await format(code, {
      parser: "typescript",
      semi: false,
      singleQuote: true,
    }),
  );
};

const compiler = ts()();

const _ = async (
  test: {
    path: t.Path;
    target: string;
    override?: boolean;
  },
) => {
  const source = await Deno.readTextFile(
    import.meta.dirname + `/__specs__${test.path}`,
  );
  const result = await compiler.compile(
    test.path,
    new t.Blob(source),
    test.target,
  );

  const expected = {
    analysis: await Deno.readTextFile(
      import.meta.dirname + `/__specs__${test.path}.analysis.txt`,
    ).catch(() => ""),
    transpiled: await Deno.readTextFile(
      import.meta.dirname + `/__specs__${test.path}.compiled.mjs`,
    ).catch(() => ""),
  };
  const transpiled = result.content
    .split("//# sourceMappingURL")[0];

  Reflect.deleteProperty(result, "content");

  try {
    assertEquals(
      await fmt(transpiled),
      await fmt(expected.transpiled),
    );

    assertEquals(
      Deno.inspect(result).trim(),
      expected.analysis.trim(),
    );
  } catch (error) {
    if (!test.override) {
      console.log(`========= ${test.path} (${test.target}) =========`);
      console.log(source.trim());
      console.log(`========= transpiled =========`);
      console.log(
        (await fmt(transpiled)).join("\n"),
      );
      console.log(`========= result =========`);
      console.log(result);

      throw error;
    }

    await Deno.writeTextFile(
      import.meta.dirname + `/__specs__${test.path}.compiled.mjs`,
      (await fmt(transpiled)).join("\n"),
    );

    await Deno.writeTextFile(
      import.meta.dirname + `/__specs__${test.path}.analysis.txt`,
      Deno.inspect(result).trim(),
    );
  }
};

Deno.test("compiler > ts", async (t) => {
  await t.step(
    "compile /test.ts on server",
    () => _({ path: `/test.ts`, target: "server" }),
  );

  await t.step(
    "use server / client 02",
    () => _({ path: `/x-02-server-use.ts`, target: "server" }),
  );

  await t.step(
    "use server / client 03",
    () =>
      _({
        path: `/x-03-server-use-client.ts`,
        target: "server",
      }),
  );

  await t.step(
    "use server / client 04",
    () =>
      _({
        path: `/x-04-client-use-client.ts`,
        target: "client",
      }),
  );

  await t.step(
    "compile class.ts on server",
    () => _({ path: `/x-01-class.ts`, target: "server" }),
  );

  await t.step({
    name: "dynamic import",
    fn: () => _({ path: `/dynamic-import.ts`, target: "server" }),
  });

  await t.step({
    name: "tracer",
    fn: () => _({ path: `/tracer.ts`, target: "server" }),
  });

  await t.step(
    "export default function without name",
    () => _({ path: `/export1.ts`, target: "server" }),
  );

  await t.step(
    "export default expression",
    () => _({ path: `/export2.ts`, target: "server" }),
  );

  await t.step(
    "export default function with name",
    () => _({ path: `/export3.ts`, target: "server" }),
  );

  await t.step(
    "export default Foo",
    () => _({ path: `/export4.ts`, target: "server" }),
  );

  await t.step(
    "export default Foo",
    () => _({ path: `/export5.ts`, target: "server" }),
  );

  await t.step(
    "export default Bar",
    () => _({ path: `/export6.ts`, target: "server" }),
  );

  await t.step(
    "export default Baz",
    () => _({ path: `/export7.ts`, target: "server" }),
  );

  await t.step(
    "compile /a.ts on server",
    () => _({ path: `/a.ts`, target: "server" }),
  );

  await t.step(
    "compile /b.tsx on server",
    () => _({ path: `/b.tsx`, target: "server" }),
  );

  await t.step(
    "compile /c.ts on server",
    () => _({ path: `/c.ts`, target: "server" }),
  );

  await t.step(
    "compile /d.ts on server",
    () => _({ path: `/d.ts`, target: "server" }),
  );

  await t.step(
    "compile /e.ts on server",
    () => _({ path: `/e.ts`, target: "server" }),
  );

  await t.step(
    "compile /x-05-worker.tsx on server",
    () => _({ path: `/x-05-worker.tsx`, target: "server" }),
  );
  return;
});
