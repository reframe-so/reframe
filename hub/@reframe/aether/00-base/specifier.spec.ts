import { assertEquals, assertThrows } from "jsr:@std/assert";
import { SerializedSpecifier, Specifier } from "./specifier.ts";
import { Path, Surprise } from "./t.ts";

Deno.test("specifier > constructor", async (ctx) => {
  await ctx.step("creates valid specifier with basic values", () => {
    const specifier = new Specifier(
      "test",
      "/path/to/module" as const,
      {},
    );

    assertEquals(specifier.scheme, "test");
    assertEquals(specifier.path, "/path/to/module");
    assertEquals(specifier.attributes, {});
  });

  await ctx.step("creates valid specifier with attributes", () => {
    const attributes = { version: "1.0", format: "module" };
    const specifier = new Specifier(
      "test",
      "/path/to/module" as const,
      attributes,
    );

    assertEquals(specifier.scheme, "test");
    assertEquals(specifier.path, "/path/to/module");
    assertEquals(specifier.attributes, attributes);
  });

  await ctx.step("throws on invalid scheme", () => {
    assertThrows(
      () =>
        new Specifier(
          "Invalid-Scheme", // Contains uppercase and hyphen
          "/path/to/module" as const,
          {},
        ),
      Surprise,
      "unexpected scheme",
    );
  });

  await ctx.step("throws on invalid path", () => {
    assertThrows(
      () =>
        new Specifier(
          "test",
          "path/without/leading/slash" as Path, // Missing leading slash
          {},
        ),
      Surprise,
      "unexpected path",
    );
  });
});

Deno.test("specifier > serialize", async (ctx) => {
  await ctx.step("serializes with empty attributes", () => {
    const specifier = new Specifier(
      "test",
      "/path/to/module" as const,
      {},
    );

    const serialized = specifier.serialize();
    assertEquals(serialized, "/~test/()/path/to/module");
  });

  await ctx.step("serializes with attributes", () => {
    const specifier = new Specifier(
      "test",
      "/path/to/module" as const,
      { version: "1.0", format: "module" },
    );

    const serialized = specifier.serialize();
    assertEquals(
      serialized,
      "/~test/(format=module,version=1.0)/path/to/module",
    );
  });

  await ctx.step("handles special characters in path", () => {
    const s1 = new Specifier(
      "test",
      "/path with spaces/and@symbols/module.js" as const,
      {},
    );

    const t1 = s1.serialize();
    assertEquals(
      t1,
      "/~test/()/path%20with%20spaces/and@symbols/module.js",
    );

    for (
      const s of [
        "../foo/bar.tsx",
        "/foo/bar.tsx",
        "npm:react@whatever/foo/bar.ts",
      ]
    ) {
      const specifier = new Specifier(
        "i",
        `/${s}`,
        { foo: "bar1" },
      );

      const serialized = specifier.serialize();
      assertEquals(
        serialized,
        `/~i/(foo=bar1)/${s.replaceAll(":", "%3A")}`,
      );

      assertEquals(
        Specifier.deserialize(serialized).path,
        `/${s}`,
      );
    }
  });

  await ctx.step("handles special characters in attributes", () => {
    const specifier = new Specifier(
      "test",
      "/path with spaces/and@symbols/module.js" as const,
      {
        "key with spaces": "value with spaces",
        "key?with@special:chars": "value?with@special:chars",
        "key=with(brackets,comma)": "value=with(brackets,comma)",
      },
    );

    const serialized = specifier.serialize();
    assertEquals(
      serialized,
      "/~test/(key%20with%20spaces=value%20with%20spaces,key%3Fwith%40special:chars=value%3Fwith%40special:chars,key%3Dwith%28brackets%2Ccomma%29=value%3Dwith%28brackets%2Ccomma%29)/path%20with%20spaces/and@symbols/module.js",
    );
  });
});

Deno.test("specifier > deserialize", async (ctx) => {
  await ctx.step("deserializes basic specifier", () => {
    const serialized = "/~test/()/path/to/module" as SerializedSpecifier;
    const specifier = Specifier.deserialize(serialized);

    assertEquals(specifier.scheme, "test");
    assertEquals(specifier.path, "/path/to/module");
    assertEquals(specifier.attributes, {});
  });

  await ctx.step("deserializes with attributes", () => {
    const serialized =
      "/~test/(format=module,version=1.0)/path/to/module" as SerializedSpecifier;
    const specifier = Specifier.deserialize(serialized);

    assertEquals(specifier.scheme, "test");
    assertEquals(specifier.path, "/path/to/module");
    assertEquals(specifier.attributes, { format: "module", version: "1.0" });
  });

  await ctx.step("throws on invalid serialized format", () => {
    assertThrows(
      () => Specifier.deserialize("test/path/to/module" as SerializedSpecifier),
      Surprise,
      "unexpected input",
    );
  });

  await ctx.step("throws on invalid serialized format", () => {
    assertThrows(
      () =>
        Specifier.deserialize("~test/path/to/module" as SerializedSpecifier),
      Surprise,
      "unexpected input",
    );
  });

  await ctx.step("deserializes attributes with special characters", () => {
    const original = new Specifier(
      "test",
      "/path with spaces/and@symbols/module.js" as const,
      {
        "key with spaces": "value with spaces",
        "key?with@special:chars": "value?with@special:chars",
        "key=with(brackets,comma)": "value=with(brackets,comma)",
      },
    );
    const serialized = original.serialize();

    const specifier = Specifier.deserialize(serialized);

    assertEquals(specifier.attributes["key with spaces"], "value with spaces");
    assertEquals(
      specifier.attributes["key?with@special:chars"],
      "value?with@special:chars",
    );
    assertEquals(
      specifier.attributes["key=with(brackets,comma)"],
      "value=with(brackets,comma)",
    );
  });
});

Deno.test("specifier > round trip", async (ctx) => {
  await ctx.step("serialize and deserialize works", () => {
    const original = new Specifier(
      "test",
      "/path/to/module" as const,
      { version: "1.0", format: "module" },
    );

    const serialized = original.serialize();
    const deserialized = Specifier.deserialize(serialized);

    assertEquals(deserialized.scheme, original.scheme);
    assertEquals(deserialized.path, original.path);
    assertEquals(deserialized.attributes, original.attributes);
  });

  await ctx.step("handles complex paths and attributes", () => {
    const original = new Specifier(
      "complex",
      "/path/with @special/chars.and/extensions" as const,
      {
        "complex-key": "complex value",
        "another": "value with spaces",
        "problematic(key=value,another=value)": "problematic(value,key=value)",
      },
    );

    const serialized = original.serialize();
    const deserialized = Specifier.deserialize(serialized);

    assertEquals(deserialized.scheme, original.scheme);
    assertEquals(deserialized.path, original.path);
    assertEquals(deserialized.attributes, original.attributes);
  });

  await ctx.step("handles URL-encoded characters correctly", () => {
    const original = new Specifier(
      "test",
      "/path with spaces/and some (special) chars" as const,
      { "key with spaces": "value with spaces" },
    );

    const serialized = original.serialize();
    const deserialized = Specifier.deserialize(serialized);

    assertEquals(deserialized.scheme, original.scheme);
    assertEquals(deserialized.path, original.path);
    assertEquals(deserialized.attributes, original.attributes);
  });
});

Deno.test("specifier > nested usage", async (ctx) => {
  await ctx.step("/~/compile/~yan/@/app.tsx?env=server", () => {
    const first = new Specifier("yan", "/@/app.tsx" as const, {
      env: "server",
    });
    const second = new Specifier("compile", first.serialize(), {
      env: "worker:typescript",
    });

    const serialized = second.serialize();
    assertEquals(
      serialized,
      "/~compile/(env=worker:typescript)/~yan/(env=server)/@/app.tsx",
    );

    const back = Specifier.deserialize(serialized);
    assertEquals(back.scheme, "compile");
    assertEquals(back.path, first.serialize());
    assertEquals(back.attributes, { env: "worker:typescript" });

    const back2 = Specifier.deserialize(back.path as SerializedSpecifier);
    assertEquals(back2.scheme, "yan");
    assertEquals(back2.path, "/@/app.tsx");
    assertEquals(back2.attributes, { env: "server" });
  });

  await ctx.step(
    "handles deeply nested specifiers with complex paths and attributes",
    () => {
      // Layer 1: Base module with complex path and attributes
      const moduleSpec = new Specifier(
        "module",
        "/path with spaces/file:name?with@special&chars.ts" as const,
        {
          "type:with?special@chars": "value:with?special@chars",
          "another key": "another:value",
        },
      );

      // Verify first layer
      const moduleSerialized = moduleSpec.serialize();
      const moduleDeserialized = Specifier.deserialize(moduleSerialized);
      assertEquals(moduleDeserialized.scheme, moduleSpec.scheme);
      assertEquals(moduleDeserialized.path, moduleSpec.path);
      assertEquals(moduleDeserialized.attributes, moduleSpec.attributes);

      // Layer 2: Compile layer with its own complex attributes
      const compileSpec = new Specifier(
        "compile",
        moduleSerialized,
        {
          "stage:number": "1",
          "options?with@special:chars": "debug:true?optimize=false",
        },
      );

      // Verify second layer
      const compileSerialized = compileSpec.serialize();
      const compileDeserialized = Specifier.deserialize(compileSerialized);
      assertEquals(compileDeserialized.scheme, compileSpec.scheme);
      assertEquals(compileDeserialized.path, moduleSerialized);
      assertEquals(compileDeserialized.attributes, compileSpec.attributes);

      // Layer 3: Link layer with more complex attributes
      const linkSpec = new Specifier(
        "link",
        compileSerialized,
        {
          "nested:config": "key1=val1?key2=val2@key3=val3",
          "format/type": "production/release",
        },
      );

      // Verify third layer
      const linkSerialized = linkSpec.serialize();
      const linkDeserialized = Specifier.deserialize(linkSerialized);
      assertEquals(linkDeserialized.scheme, linkSpec.scheme);
      assertEquals(linkDeserialized.path, compileSerialized);
      assertEquals(linkDeserialized.attributes, linkSpec.attributes);

      // Now verify we can decode all the way back down through the layers
      const link = Specifier.deserialize(linkSerialized);
      assertEquals(link.scheme, "link");

      const compile = Specifier.deserialize(link.path as SerializedSpecifier);
      assertEquals(compile.scheme, "compile");
      assertEquals(compile.attributes["stage:number"], "1");
      assertEquals(
        compile.attributes["options?with@special:chars"],
        "debug:true?optimize=false",
      );

      const module = Specifier.deserialize(compile.path as SerializedSpecifier);
      assertEquals(module.scheme, "module");
      assertEquals(
        module.path,
        "/path with spaces/file:name?with@special&chars.ts",
      );
      assertEquals(
        module.attributes["type:with?special@chars"],
        "value:with?special@chars",
      );
      assertEquals(module.attributes["another key"], "another:value");
    },
  );

  await ctx.step(
    "handles nested specifiers with repeated special characters",
    () => {
      // Create a specifier with repeated special characters
      const inner = new Specifier(
        "test",
        "/path/with////multiple???question@@marks" as const,
        {
          "key????with????questions": "value????with????questions",
          "key@@@@with@@@@ats": "value@@@@with@@@@ats",
        },
      );

      // Wrap it once
      const middle = new Specifier(
        "first",
        inner.serialize(),
        { "multiple???": "special???chars" },
      );

      // Wrap it again
      const outer = new Specifier(
        "second",
        middle.serialize(),
        { "more@@@@special": "chars@@@@here" },
      );

      // Serialize the whole thing
      const serialized = outer.serialize();

      // Now unwind and verify each layer
      const outerResult = Specifier.deserialize(serialized);
      assertEquals(outerResult.scheme, "second");
      assertEquals(outerResult.attributes["more@@@@special"], "chars@@@@here");

      const middleResult = Specifier.deserialize(
        outerResult.path as SerializedSpecifier,
      );
      assertEquals(middleResult.scheme, "first");
      assertEquals(middleResult.attributes["multiple???"], "special???chars");

      const innerResult = Specifier.deserialize(
        middleResult.path as SerializedSpecifier,
      );
      assertEquals(innerResult.scheme, "test");
      assertEquals(
        innerResult.path,
        "/path/with////multiple???question@@marks",
      );
      assertEquals(
        innerResult.attributes["key????with????questions"],
        "value????with????questions",
      );
      assertEquals(
        innerResult.attributes["key@@@@with@@@@ats"],
        "value@@@@with@@@@ats",
      );
    },
  );

  await ctx.step(
    "handles nested specifiers with mixed URL-encoded characters",
    () => {
      // Create a specifier with a mix of spaces, URL-special chars, and other special chars
      const base = new Specifier(
        "inner",
        "/path with spaces/file?with@special:chars.js" as const,
        {
          "key with spaces": "value with spaces",
          "key?with@special:chars": "value?with@special:chars",
          "normal-key": "normal-value",
          "problematic(key=value,another=value)":
            "problematic(value,key=value)",
        },
      );

      // Wrap it in another specifier that also has special chars
      const wrapped = new Specifier(
        "outer",
        base.serialize(),
        {
          "mixed key with?@:special chars": "mixed value with?@:special chars",
          "spaces in key": "spaces in value",
          "another-problematic(key=value,another=value)":
            "another-problematic(value,key=value)",
        },
      );

      // Serialize everything
      const serialized = wrapped.serialize();

      // First verify the outer layer
      const wrappedResult = Specifier.deserialize(serialized);
      assertEquals(wrappedResult.scheme, "outer");
      assertEquals(
        wrappedResult.attributes["mixed key with?@:special chars"],
        "mixed value with?@:special chars",
      );
      assertEquals(
        wrappedResult.attributes["spaces in key"],
        "spaces in value",
      );
      assertEquals(
        wrappedResult
          .attributes["another-problematic(key=value,another=value)"],
        "another-problematic(value,key=value)",
      );

      // Then verify the inner layer
      const baseResult = Specifier.deserialize(
        wrappedResult.path as SerializedSpecifier,
      );
      assertEquals(baseResult.scheme, "inner");
      assertEquals(
        baseResult.path,
        "/path with spaces/file?with@special:chars.js",
      );
      assertEquals(
        baseResult.attributes["key with spaces"],
        "value with spaces",
      );
      assertEquals(
        baseResult.attributes["key?with@special:chars"],
        "value?with@special:chars",
      );
      assertEquals(
        baseResult.attributes["problematic(key=value,another=value)"],
        "problematic(value,key=value)",
      );
      assertEquals(baseResult.attributes["normal-key"], "normal-value");
    },
  );
});
