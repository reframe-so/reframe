import { assertEquals } from "jsr:@std/assert";
import { mapImports } from "./map-imports.ts";
import { createTypeImportMapper, toTypesPackageUrl } from "./npm.ts";

Deno.test("mapImports", async (ctx) => {
  await ctx.step("transforms all kind of import/export constructs", () => {
    const source = `
import { a } from "a";
import type { b } from "b";
import * as c from "c";
import d from "d";
import "side-effect";
export { e } from "e";
export type { f } from "f";
export * from "g";
export * as h from "h";
const i = await import("i");
import("j").then(m => m);
declare const k: () => Promise<typeof import("k")>;
declare const l: import("l").SomeType;
import { m as n } from "n";
import { o as p } from "o" with { foo: "bar" };
foo.import("not-an-import");
const str = "also-not-an-import";
`;

    const result = mapImports(source, (s, _attrs) => s.toUpperCase());

    assertEquals(
      result,
      `
import { a } from "A";
import type { b } from "B";
import * as c from "C";
import d from "D";
import "SIDE-EFFECT";
export { e } from "E";
export type { f } from "F";
export * from "G";
export * as h from "H";
const i = await import("I");
import("J").then(m => m);
declare const k: () => Promise<typeof import("K")>;
declare const l: import("L").SomeType;
import { m as n } from "N";
import { o as p } from "O" with { foo: "bar" };
foo.import("not-an-import");
const str = "also-not-an-import";
`,
    );
  });

  await ctx.step("provides sorted attributes to mapper function", () => {
    const source = `
import { a } from "a" with { zebra: "z", alpha: "a" };
export { b } from "b" with { env: "server" };
const c = await import("c", { with: { foo: "bar", baz: "qux" } });
declare const d: import("d", { with: { type: "json" } }).SomeType;
`;

    const collected: Array<{ specifier: string; attributes: Record<string, string> }> = [];

    mapImports(source, (specifier, attributes) => {
      collected.push({ specifier, attributes });
      return specifier; // identity, just collecting
    });

    assertEquals(collected, [
      { specifier: "a", attributes: { alpha: "a", zebra: "z" } },
      { specifier: "b", attributes: { env: "server" } },
      { specifier: "c", attributes: { baz: "qux", foo: "bar" } },
      { specifier: "d", attributes: { type: "json" } },
    ]);
  });

  await ctx.step("esm.sh type definition path rewriting", () => {
    // Scenario: x-typescript-types = "https://esm-136.fly.dev/@foo/bar@1.2.3/dist/esm/baz.d.ts"
    // Inside that file we have:
    // - Relative imports like "./utils.d.mts" -> "@foo/bar/dist/esm/utils"
    // - Absolute CDN URLs like "https://esm-136.fly.dev/csstypes@2.3.4/dist/index.d.ts" -> "csstypes/dist/index"
    // - Already qualified imports like "csstypes/foo" or "csstypes" -> unchanged
    const source = `
import type { Comparator } from "./internal/types.d.mts";
import { baseMax } from "./internal/baseMax.d.mts";
export * from "./shared.d.ts";
declare const x: typeof import("../index.d.mts");
import "https://esm-136.fly.dev/csstypes@2.3.4/dist/index.d.ts";
import "https://esm-136.fly.dev/@css/types@2.3.4/dist/index.d.ts";
import "https://esm-136.fly.dev/@scope/pkg@1.0.0/foo.d.ts";
import "http://esm-136.fly.dev/@scope/pkg@1.0.0/bar.d.ts";
import { something } from "csstypes/foo";
import { something } from "@css/types/foo";
import { another } from "csstypes";
import { another } from "@css/types";
`;

    const cdn = "https://esm-136.fly.dev";
    const xTypescriptTypes =
      "https://esm-136.fly.dev/@foo/bar@1.2.3/dist/esm/baz.d.ts";

    const mapper = createTypeImportMapper(cdn, xTypescriptTypes);
    const result = mapImports(source, mapper);

    assertEquals(
      result,
      `
import type { Comparator } from "@foo/bar/dist/esm/internal/types";
import { baseMax } from "@foo/bar/dist/esm/internal/baseMax";
export * from "@foo/bar/dist/esm/shared";
declare const x: typeof import("@foo/bar/dist/index");
import "csstypes/dist/index";
import "@css/types/dist/index";
import "@scope/pkg/foo";
import "@scope/pkg/bar";
import { something } from "csstypes/foo";
import { something } from "@css/types/foo";
import { another } from "csstypes";
import { another } from "@css/types";
`,
    );
  });
});

Deno.test("toTypesPackageUrl", async (ctx) => {
  await ctx.step("converts unscoped packages to @types/ (drops version)", () => {
    assertEquals(
      toTypesPackageUrl("https://esm.sh/json-schema@0.4.0"),
      "https://esm.sh/@types/json-schema",
    );
    assertEquals(
      toTypesPackageUrl("https://esm.sh/lodash@4.17.21/get"),
      "https://esm.sh/@types/lodash/get",
    );
  });

  await ctx.step("converts scoped packages to @types/scope__pkg", () => {
    assertEquals(
      toTypesPackageUrl("https://esm.sh/@babel/core@7.0.0"),
      "https://esm.sh/@types/babel__core",
    );
    assertEquals(
      toTypesPackageUrl("https://esm.sh/@foo/bar@1.2.3/dist/index"),
      "https://esm.sh/@types/foo__bar/dist/index",
    );
  });

  await ctx.step("handles * prefix for bundled requests", () => {
    assertEquals(
      toTypesPackageUrl("https://esm.sh/*json-schema@0.4.0"),
      "https://esm.sh/*@types/json-schema",
    );
    assertEquals(
      toTypesPackageUrl("https://esm.sh/*@scope/pkg@1.0.0/subpath"),
      "https://esm.sh/*@types/scope__pkg/subpath",
    );
  });

  await ctx.step("preserves query parameters", () => {
    assertEquals(
      toTypesPackageUrl("https://esm.sh/json-schema@0.4.0?target=esnext"),
      "https://esm.sh/@types/json-schema?target=esnext",
    );
  });

  await ctx.step("returns null for invalid URLs", () => {
    assertEquals(toTypesPackageUrl("not-a-url"), null);
    assertEquals(toTypesPackageUrl("https://esm.sh/"), null);
  });
});
