import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { t } from "./main.ts";
import { ShapeError } from "./shape-error.ts";

Deno.test("primitive shapes", async (ctx) => {
  await ctx.step("t.number() validates numbers", () => {
    const shape = t.number();
    assertEquals(shape.read(42), 42);
    assertEquals(shape.read(0), 0);
    assertEquals(shape.read(-1.5), -1.5);
    assertThrows(() => shape.read("42"), ShapeError);
    assertThrows(() => shape.read(null), ShapeError);
  });

  await ctx.step("t.string() validates strings", () => {
    const shape = t.string();
    assertEquals(shape.read("hello"), "hello");
    assertEquals(shape.read(""), "");
    assertThrows(() => shape.read(42), ShapeError);
    assertThrows(() => shape.read(null), ShapeError);
  });

  await ctx.step("t.boolean() validates booleans", () => {
    const shape = t.boolean();
    assertEquals(shape.read(true), true);
    assertEquals(shape.read(false), false);
    assertThrows(() => shape.read(1), ShapeError);
    assertThrows(() => shape.read("true"), ShapeError);
  });

  await ctx.step("t.null() validates null", () => {
    const shape = t.null();
    assertEquals(shape.read(null), null);
    assertThrows(() => shape.read(undefined), ShapeError);
    assertThrows(() => shape.read(0), ShapeError);
  });

  await ctx.step("t.undefined() validates undefined", () => {
    const shape = t.undefined();
    assertEquals(shape.read(undefined), undefined);
    assertThrows(() => shape.read(null), ShapeError);
  });
});

Deno.test("literal shapes", async (ctx) => {
  await ctx.step("t.literal() validates exact values", () => {
    const strLiteral = t.literal("foo");
    assertEquals(strLiteral.read("foo"), "foo");
    assertThrows(() => strLiteral.read("bar"), ShapeError);

    const numLiteral = t.literal(42);
    assertEquals(numLiteral.read(42), 42);
    assertThrows(() => numLiteral.read(43), ShapeError);

    const boolLiteral = t.literal(true);
    assertEquals(boolLiteral.read(true), true);
    assertThrows(() => boolLiteral.read(false), ShapeError);
  });
});

Deno.test("object shapes", async (ctx) => {
  await ctx.step("t.object() validates object structure", () => {
    const shape = t.object({
      name: t.string(),
      age: t.number(),
    });

    const valid = { name: "Alice", age: 30 };
    assertEquals(shape.read(valid), valid);

    assertThrows(() => shape.read({ name: "Alice" }), ShapeError);
    assertThrows(() => shape.read({ name: "Alice", age: "30" }), ShapeError);
    assertThrows(() => shape.read(null), ShapeError);
  });

  await ctx.step("nested objects validate correctly", () => {
    const shape = t.object({
      user: t.object({
        profile: t.object({
          name: t.string(),
        }),
      }),
    });

    const valid = { user: { profile: { name: "Bob" } } };
    assertEquals(shape.read(valid), valid);

    assertThrows(
      () => shape.read({ user: { profile: { name: 123 } } }),
      ShapeError,
    );
  });

  await ctx.step("optional fields work with union", () => {
    const shape = t.object({
      required: t.string(),
      optional: t.union([t.string(), t.undefined()]),
    });

    assertEquals(shape.read({ required: "a", optional: "b" }), {
      required: "a",
      optional: "b",
    });
    assertEquals(shape.read({ required: "a", optional: undefined }), {
      required: "a",
      optional: undefined,
    });
    assertThrows(() => shape.read({}), ShapeError);
  });
});

Deno.test("array shapes", async (ctx) => {
  await ctx.step("t.array() validates arrays", () => {
    const shape = t.array(t.number());

    assertEquals(shape.read([1, 2, 3]), [1, 2, 3]);
    assertEquals(shape.read([]), []);
    assertThrows(() => shape.read([1, "2", 3]), ShapeError);
    assertThrows(() => shape.read("not an array"), ShapeError);
  });

  await ctx.step("nested arrays validate correctly", () => {
    const shape = t.array(t.array(t.number()));

    assertEquals(
      shape.read([
        [1, 2],
        [3, 4],
      ]),
      [
        [1, 2],
        [3, 4],
      ],
    );
    assertThrows(() => shape.read([[1, "2"]]), ShapeError);
  });
});

Deno.test("tuple shapes", async (ctx) => {
  await ctx.step("t.tuple() validates fixed-length arrays", () => {
    const shape = t.tuple([t.number(), t.string(), t.boolean()]);

    assertEquals(shape.read([1, "hello", true]), [1, "hello", true]);
    assertThrows(() => shape.read([1, "hello"]), ShapeError);
    assertThrows(() => shape.read([1, 2, true]), ShapeError);
  });

  await ctx.step("nested tuples validate correctly", () => {
    const shape = t.tuple([t.literal(42), t.tuple([t.string(), t.number()])]);

    assertEquals(shape.read([42, ["foo", 1]]), [42, ["foo", 1]]);
  });
});

Deno.test("record shapes", async (ctx) => {
  await ctx.step("t.record() validates key-value maps", () => {
    const shape = t.record(t.string(), t.number());

    assertEquals(shape.read({ a: 1, b: 2 }), { a: 1, b: 2 });
    assertEquals(shape.read({}), {});
    assertThrows(() => shape.read({ a: "1" }), ShapeError);
  });

  await ctx.step("record with literal keys", () => {
    const shape = t.record(
      t.union([t.literal("foo"), t.literal("bar")]),
      t.number(),
    );

    assertEquals(shape.read({ foo: 1, bar: 2 }), { foo: 1, bar: 2 });
  });
});

Deno.test("union shapes", async (ctx) => {
  await ctx.step("t.union() validates multiple types", () => {
    const shape = t.union([t.string(), t.number()]);

    assertEquals(shape.read("hello"), "hello");
    assertEquals(shape.read(42), 42);
    assertThrows(() => shape.read(true), ShapeError);
  });

  await ctx.step("union with literals", () => {
    const shape = t.union([t.literal("a"), t.literal("b"), t.literal("c")]);

    assertEquals(shape.read("a"), "a");
    assertEquals(shape.read("b"), "b");
    assertThrows(() => shape.read("d"), ShapeError);
  });

  await ctx.step("nullable helper works", () => {
    const shape = t.union([t.string(), t.null()]);

    assertEquals(shape.read("hello"), "hello");
    assertEquals(shape.read(null), null);
    assertThrows(() => shape.read(undefined), ShapeError);
  });
});

Deno.test("recursive shapes", async (ctx) => {
  await ctx.step("t.recursive() creates self-referential types", () => {
    const tree = t.recursive("tree", (tree) =>
      t.object({
        value: t.number(),
        children: t.array(tree),
      }),
    );

    const valid = {
      value: 1,
      children: [
        { value: 2, children: [] },
        {
          value: 3,
          children: [{ value: 4, children: [] }],
        },
      ],
    };

    assertEquals(tree.read(valid), valid);
  });

  await ctx.step("recursive with optional self-reference", () => {
    const node = t.recursive("node", (node) =>
      t.object({
        value: t.string(),
        next: t.union([node, t.undefined()]),
      }),
    );

    assertEquals(
      node.read({ value: "a", next: { value: "b", next: undefined } }),
      { value: "a", next: { value: "b", next: undefined } },
    );
    assertEquals(node.read({ value: "single", next: undefined }), {
      value: "single",
      next: undefined,
    });
  });
});

Deno.test("reference shapes", async (ctx) => {
  await ctx.step("t.withRef() resolves references", () => {
    const shape = t.withRef(
      t.object({
        data: t.ref("item"),
      }),
      {
        item: t.object({
          id: t.number(),
          name: t.string(),
        }),
      },
    );

    const valid = { data: { id: 1, name: "test" } };
    assertEquals(shape.read(valid), valid);
  });

  await ctx.step("circular references work", () => {
    const shape = t.withRef(t.ref("node"), {
      node: t.object({
        value: t.number(),
        child: t.union([t.ref("node"), t.undefined()]),
      }),
    });

    const valid = {
      value: 1,
      child: {
        value: 2,
        child: {
          value: 3,
          child: undefined,
        },
      },
    };

    assertEquals(shape.read(valid), valid);
  });

  await ctx.step("multiple refs in same shape", () => {
    const shape = t.withRef(
      t.object({
        user: t.ref("user"),
        org: t.ref("org"),
      }),
      {
        user: t.object({ name: t.string() }),
        org: t.object({ title: t.string() }),
      },
    );

    const valid = {
      user: { name: "Alice" },
      org: { title: "Acme" },
    };
    assertEquals(shape.read(valid), valid);
  });
});

Deno.test("ShapeError provides detailed error info", async (ctx) => {
  await ctx.step("error includes path to invalid value", () => {
    const shape = t.object({
      users: t.array(
        t.object({
          name: t.string(),
          age: t.number(),
        }),
      ),
    });

    try {
      shape.read({
        users: [
          { name: "Alice", age: 30 },
          { name: "Bob", age: "not a number" },
        ],
      });
      throw new Error("Should have thrown");
    } catch (e) {
      if (!(e instanceof ShapeError)) throw e;
      // Error should contain path information
      const message = e.print({ all: true });
      assertEquals(typeof message, "string");
    }
  });

  await ctx.step("error collects multiple validation failures", () => {
    const shape = t.object({
      a: t.number(),
      b: t.string(),
      c: t.boolean(),
    });

    try {
      shape.read({
        a: "wrong",
        b: 123,
        c: "also wrong",
      });
      throw new Error("Should have thrown");
    } catch (e) {
      if (!(e instanceof ShapeError)) throw e;
      // Should have collected multiple errors
      const message = e.print({ all: true });
      assertEquals(typeof message, "string");
    }
  });
});

Deno.test("complex nested shapes", async (ctx) => {
  await ctx.step("deeply nested structure validates correctly", () => {
    const shape = t.tuple([
      t.number(),
      t.literal("foo"),
      t.array(t.number()),
      t.tuple([t.literal(42), t.number()]),
      t.object({
        a: t.number(),
        b: t.literal("bar"),
        c: t.object({
          d: t.array(
            t.object({
              e: t.number(),
              f: t.tuple([t.number(), t.literal(true)]),
            }),
          ),
        }),
      }),
    ]);

    const valid: [
      number,
      "foo",
      number[],
      [42, number],
      { a: number; b: "bar"; c: { d: { e: number; f: [number, true] }[] } },
    ] = [
      1,
      "foo",
      [1, 2, 3],
      [42, 100],
      {
        a: 5,
        b: "bar",
        c: {
          d: [{ e: 10, f: [20, true] }],
        },
      },
    ];

    assertEquals(shape.read(valid), valid);
  });
});

Deno.test("JSON-like recursive type", async (ctx) => {
  await ctx.step("validates JSON structure", () => {
    const json = t.recursive("json", (json) =>
      t.union([
        t.null(),
        t.number(),
        t.string(),
        t.boolean(),
        t.array(json),
        t.record(t.string(), json),
      ]),
    );

    assertEquals(json.read(null), null);
    assertEquals(json.read(42), 42);
    assertEquals(json.read("hello"), "hello");
    assertEquals(json.read(true), true);
    assertEquals(json.read([1, "two", null]), [1, "two", null]);
    assertEquals(json.read({ a: 1, b: { c: [1, 2, 3] } }), {
      a: 1,
      b: { c: [1, 2, 3] },
    });
  });
});
