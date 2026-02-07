import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import * as t from "./t.ts";
import {
  Graph,
  PackageJson,
  PackageManager,
  Registry,
  splitSpecifier,
} from "./index.ts";
import { NpmRegistry, parsePeerDependencies } from "./npm.ts";
import * as semver from "jsr:@std/semver";

const graphs = {
  zero: {
    dependencies: {},
    packages: {},
    snapshots: {},
    staging: {},
    version: 1,
  },
} satisfies Record<string, Graph>;

class TestRegistry implements Registry {
  registry = new Map<string, PackageJson>();

  register(name: string, version: string, json: PackageJson) {
    this.registry.set(`${name}@${version}`, json);
  }

  parse(): { name: string; version: string; path: t.Path } {
    throw t.Surprise.with`not implemented`;
  }

  fetch(target: string, path: t.Path): Promise<t.Blob> {
    throw t.Surprise.with`not implemented`;
  }

  async resolve(name: string, specifier: string) {
    if (specifier === "latest") {
      const latestVersion = semver.maxSatisfying(
        Array.from(this.registry.entries())
          .filter(([_, json]) => json.name === name)
          .map(([_, json]) => semver.parse(json.version)),
        semver.parseRange("*"),
      );

      if (latestVersion) {
        const result = this.registry.entries().find(([_, json]) =>
          semver.equals(semver.parse(json.version), latestVersion)
        );
        if (!result) {
          throw new Error(`No valid versions found for ${name}`);
        }
        return result[1];
      }

      throw new Error(`No valid versions found for ${name}`);
    }

    for (const [key, json] of this.registry.entries()) {
      if (
        json.name === name &&
        semver.satisfies(
          semver.parse(json.version),
          semver.parseRange(specifier),
        )
      ) {
        console.log(
          `[resolve] ${name}@${json.version} satisfies ${specifier}`,
        );
        return json;
      }
    }

    throw new Error(
      `package ${name}@${specifier} not found in registry`,
    );
  }
}

function __<E extends Error = Error>(
  { step }: Deno.TestContext,
  name: string,
  options: {
    package: string[];
    with?: {
      registry: Record<string, PackageJson>;
    };
    rejects?: [abstract new (...args: any[]) => E, string];
    override?: boolean;
    skip?: boolean;
  },
) {
  if (options.skip) {
    return;
  }

  return step(name, async () => {
    const registry = options.with ? new TestRegistry() : new NpmRegistry({
      cdn: "https://esm-136.fly.dev",
      cache: t.cache.web("test/aether/registry/npm-01"),
    });

    const manager = new PackageManager(registry, graphs.zero);

    const verify = async (graph: Graph) => {
      const snapshot = await Deno.readTextFile(
        new URL(`./__specs__/npm/${name}.txt`, import.meta.url),
      ).catch(() => "");

      try {
        assertEquals(
          t.inspect(graph, { colors: false, sorted: true }),
          snapshot,
        );
      } catch (err) {
        const override = options.override ?? false;
        if (override) {
          await Deno.writeTextFile(
            new URL(`./__specs__/npm/${name}.txt`, import.meta.url),
            t.inspect(graph, { colors: false, sorted: true }),
            { create: true },
          );
        }
        throw err;
      }
    };

    if (options.with) {
      for (
        const [key, json] of Object.entries(options.with.registry).sort(
          ([a], [b]) => b.localeCompare(a),
        )
      ) {
        const [name, version] = splitSpecifier(key);
        console.log(
          `[register] ${name}@${version} (${json.name})`,
        );

        (registry as TestRegistry).register(name, version, json);
      }
    }

    if (!options.rejects) {
      for (const pkg of options.package) {
        const [name, specifier] = splitSpecifier(pkg);
        await manager.add(name, specifier);
      }

      await verify(manager.graph());
    } else {
      console.log(t.inspect(manager.graph, { colors: true, depth: 10 }));

      try {
        await assertRejects(
          async () => {
            for (const pkg of options.package) {
              const [name, specifier] = splitSpecifier(pkg);
              await manager.add(name, specifier);
            }
          },
          options.rejects[0],
          options.rejects[1],
        );
      } catch (e) {
        await verify(manager.graph());

        throw e;
      }
    }
  });
}

Deno.test("parse peer dependencies", async (ctx) => {
  await ctx.step("no peer dependencies", () => {
    assertEquals(parsePeerDependencies("latest"), {
      version: "latest",
      peers: {},
    });
  });

  await ctx.step("with peer dependencies", () => {
    assertEquals(parsePeerDependencies("latest(react-dom@latest)"), {
      version: "latest",
      peers: {
        "react-dom": "latest",
      },
    });
  });

  await ctx.step("with multiple peer dependencies", () => {
    assertEquals(parsePeerDependencies("1(a@1)(b@2)"), {
      version: "1",
      peers: {
        a: "1",
        b: "2",
      },
    });
  });

  await ctx.step("with nested peer dependencies", () => {
    assertEquals(parsePeerDependencies("1(a@1)(b@2(c@3))"), {
      version: "1",
      peers: {
        a: "1",
        b: "2(c@3)",
      },
    });
  });

  await ctx.step("with multiple levels of nested peer dependencies", () => {
    assertEquals(
      parsePeerDependencies(
        "11.0.2(@tanstack/react-query@5.71.10(react@19.1.0))(@trpc/client@11.0.2(@trpc/server@11.0.2(typescript@5.8.3))(typescript@5.8.3))(@trpc/react-query@11.0.2(@tanstack/react-query@5.71.10(react@19.1.0))(@trpc/client@11.0.2(@trpc/server@11.0.2(typescript@5.8.3))(typescript@5.8.3))(@trpc/server@11.0.2(typescript@5.8.3))(react-dom@19.1.0(react@19.1.0))(react@19.1.0)(typescript@5.8.3))(@trpc/server@11.0.2(typescript@5.8.3))(next@15.2.4(@opentelemetry/api@1.9.0)(@playwright/test@1.51.1)(babel-plugin-react-compiler@19.0.0-beta-e993439-20250328)(react-dom@19.1.0(react@19.1.0))(react@19.1.0)(sass@1.86.3))(react-dom@19.1.0(react@19.1.0))(react@19.1.0)(typescript@5.8.3)",
      ),
      {
        version: "11.0.2",
        peers: {
          "@tanstack/react-query": "5.71.10(react@19.1.0)",
          "@trpc/client":
            "11.0.2(@trpc/server@11.0.2(typescript@5.8.3))(typescript@5.8.3)",
          "@trpc/react-query":
            "11.0.2(@tanstack/react-query@5.71.10(react@19.1.0))(@trpc/client@11.0.2(@trpc/server@11.0.2(typescript@5.8.3))(typescript@5.8.3))(@trpc/server@11.0.2(typescript@5.8.3))(react-dom@19.1.0(react@19.1.0))(react@19.1.0)(typescript@5.8.3)",
          "@trpc/server": "11.0.2(typescript@5.8.3)",
          "next":
            "15.2.4(@opentelemetry/api@1.9.0)(@playwright/test@1.51.1)(babel-plugin-react-compiler@19.0.0-beta-e993439-20250328)(react-dom@19.1.0(react@19.1.0))(react@19.1.0)(sass@1.86.3)",
          "react-dom": "19.1.0(react@19.1.0)",
          "react": "19.1.0",
          "typescript": "5.8.3",
        },
      },
    );
  });
});

Deno.test("npm.parse", async (ctx) => {
  const registry = new NpmRegistry({
    cdn: "https://esm-136.fly.dev",
    cache: t.cache.web("test/aether/registry/npm-01"),
  });

  await ctx.step("name@version", () => {
    assertEquals(registry.parse("react@latest"), {
      name: "react",
      version: "latest",
      path: "/",
    });
  });

  await ctx.step("name", () => {
    assertEquals(registry.parse("react"), {
      name: "react",
      version: "",
      path: "/",
    });
  });

  await ctx.step("name/subpath", () => {
    assertEquals(registry.parse("react/jsx-runtime"), {
      name: "react",
      version: "",
      path: "/jsx-runtime",
    });
  });

  await ctx.step("name@version/subpath", () => {
    assertEquals(registry.parse("react@latest/jsx-runtime"), {
      name: "react",
      version: "latest",
      path: "/jsx-runtime",
    });
  });

  await ctx.step("name@semver/subpath", () => {
    assertEquals(registry.parse("react@^18.0.0/jsx/runtime"), {
      name: "react",
      version: "^18.0.0",
      path: "/jsx/runtime",
    });
  });

  await ctx.step("name@semver+dist/subpath", () => {
    assertEquals(registry.parse("react@19.0.0-canary/jsx/runtime"), {
      name: "react",
      version: "19.0.0-canary",
      path: "/jsx/runtime",
    });
  });

  await ctx.step("@scope/name@version", () => {
    assertEquals(registry.parse("@scope/react@latest"), {
      name: "@scope/react",
      version: "latest",
      path: "/",
    });
  });

  await ctx.step("@scope/name", () => {
    assertEquals(registry.parse("@scope/react"), {
      name: "@scope/react",
      version: "",
      path: "/",
    });
  });

  await ctx.step("@scope/name/subpath", () => {
    assertEquals(registry.parse("@scope/react/jsx-runtime"), {
      name: "@scope/react",
      version: "",
      path: "/jsx-runtime",
    });
  });

  await ctx.step("@scope/name@version/subpath", () => {
    assertEquals(registry.parse("@scope/react@latest/jsx-runtime"), {
      name: "@scope/react",
      version: "latest",
      path: "/jsx-runtime",
    });
  });

  await ctx.step("@scope/name@semver/subpath", () => {
    assertEquals(registry.parse("@scope/react@^18.0.0/jsx/runtime"), {
      name: "@scope/react",
      version: "^18.0.0",
      path: "/jsx/runtime",
    });
  });

  await ctx.step("with peer dependency", () => {
    assertEquals(
      registry.parse(
        "foo@0.6.2(@livekit/agents@0.7.1(@livekit/rtc-node@0.13.10)(bufferutil@4.0.9)(utf-8-validate@6.0.5))(@livekit/rtc-node@0.13.10)(bufferutil@4.0.9)(utf-8-validate@6.0.5)/bar/baz",
      ),
      {
        name: "foo",
        version:
          "0.6.2(@livekit/agents@0.7.1(@livekit/rtc-node@0.13.10)(bufferutil@4.0.9)(utf-8-validate@6.0.5))(@livekit/rtc-node@0.13.10)(bufferutil@4.0.9)(utf-8-validate@6.0.5)",
        path: "/bar/baz",
      },
    );
  });

  // --- START: Added Tests (Using assertThrows) ---
  await ctx.step("version with trailing slash", () => {
    assertEquals(registry.parse("pkg@1.0.0/"), {
      name: "pkg",
      version: "1.0.0",
      path: "/", // Trailing slash is ignored/becomes empty subpath
    });
  });

  await ctx.step("empty string", () => {
    assertThrows(
      () => registry.parse(""),
      t.Surprise,
      "invalid specifier format: ",
    );
  });

  await ctx.step("just @", () => {
    assertThrows(
      () => registry.parse("@"),
      t.Surprise,
      "invalid specifier format: @",
    );
  });

  await ctx.step("just /", () => {
    assertThrows(
      () => registry.parse("/"),
      t.Surprise,
      "invalid specifier format: /",
    );
  });

  await ctx.step("invalid package name chars", () => {
    assertThrows(
      () => registry.parse("pkg name with spaces"),
      t.Surprise,
      "invalid specifier format: pkg name with spaces",
    );
  });

  await ctx.step("unbalanced parens (open)", () => {
    assertThrows(
      () => registry.parse("pkg@1.0.0(peer@1/sub"),
      t.Surprise,
      "unbalanced parentheses in version/subpath: 1.0.0(peer@1/sub",
    );
  });

  await ctx.step("unbalanced parens (close)", () => {
    assertThrows(
      () => registry.parse("pkg@1.0.0)peer@1/sub"),
      t.Surprise,
      "unbalanced parentheses in version/subpath: 1.0.0)peer@1/sub",
    );
  });
  // --- END: Added Tests ---
});

Deno.test("manager.add", async (t) => {
  await __(t, "10-ai", {
    package: [
      "a@1.0.0",
    ],
    with: {
      registry: {
        "a@1.0.0": {
          name: "a",
          version: "1.0.0",
          dependencies: {
            "b": "1.0.1",
          },
          peerDependencies: {
            p: "1.0.0",
          },
        },

        "b@1.0.1": {
          name: "b",
          version: "1.0.1",
          dependencies: {
            "c": "1.0.0",
          },
          peerDependencies: {
            p: "1.0.0",
          },
        },

        "c@1.0.0": {
          name: "c",
          version: "1.0.0",
          dependencies: {},
          peerDependencies: {
            p: "1.0.0",
          },
        },

        "p@1.0.0": {
          name: "p",
          version: "1.0.0",
          dependencies: {},
          peerDependencies: {},
        },
      },
    },
  });

  await __(t, "10-ai-1", {
    package: [
      "a@1.0.1",
    ],
    with: {
      registry: {
        "a@1.0.1": {
          name: "a",
          version: "1.0.1",
          dependencies: {
            "b": "1.0.0",
          },
          peerDependencies: {
            p: "1.0.0",
          },
        },

        "b@1.0.0": {
          name: "b",
          version: "1.0.0",
          dependencies: {
            "c": "1.0.0",
          },
          peerDependencies: {
            p: "1.0.0",
          },
        },

        "c@1.0.0": {
          name: "c",
          version: "1.0.0",
          dependencies: {},
          peerDependencies: {
            p: "1.0.0",
          },
        },

        "p@1.0.0": {
          name: "p",
          version: "1.0.0",
          dependencies: {},
          peerDependencies: {},
        },
      },
    },
  });

  await __(t, "08-a+x+y", {
    package: ["a@latest", "x@2.0.0", "y@2.0.0"],
    with: {
      registry: {
        "a@1.0.0": {
          name: "a",
          version: "1.0.0",
          dependencies: {
            "b": "*",
          },
          peerDependencies: {
            "x": "*",
          },
        },
        "b@1.0.0": {
          name: "b",
          version: "1.0.0",
          dependencies: {
            "a": "*",
          },
          peerDependencies: {
            "y": "*",
          },
        },
        "x@2.0.0": {
          name: "x",
          version: "2.0.0",
          dependencies: {},
        },
        "y@2.0.0": {
          name: "y",
          version: "2.0.0",
          dependencies: {},
        },
      },
    },
  });

  await __(t, "09-a(x)+b(a(x))", {
    package: [
      "a@1.0.0",
      "b@2.0.0",
    ],
    with: {
      registry: {
        "a@1.0.0": {
          name: "a",
          version: "1.0.0",
          dependencies: {},
          peerDependencies: {
            "x": "*",
          },
        },
        "b@2.0.0": {
          name: "b",
          version: "2.0.0",
          dependencies: {
            "a": "2.0.0",
          },
          peerDependencies: {
            "y": "*",
          },
        },
        "a@2.0.0": {
          name: "a",
          version: "2.0.0",
          dependencies: {},
          peerDependencies: {
            "x": "*",
          },
        },
        "x@2.0.0": {
          name: "x",
          version: "2.0.0",
          dependencies: {},
        },
        "y@2.0.0": {
          name: "y",
          version: "2.0.0",
          dependencies: {},
        },
      },
    },
  });

  return;

});
