import { SCC } from "../00-base/utils/scc.ts";
import { sign } from "./scc-signature.ts";
import * as t from "./t.ts";

function __(
  ctx: Deno.TestContext,
  name: string,
  _: {
    edges: Record<string, string[]>;
    expect: Record<
      string,
      (
        e:
          & Record<string, string>
          & (
            (args: TemplateStringsArray) => string
          ),
      ) => string | [number, string]
    >;
  },
) {
  return ctx.step(name, async () => {
    const scc = new SCC<string>();

    for (const [name, edges] of Object.entries(_.edges)) {
      for (const _ of edges) {
        const [edge, label = ""] = _.split(":");
        scc.addEdge(name, edge, label);
      }
    }

    const signatures = await sign(
      scc,
      new Map(Object.keys(_.edges).map((name): [string, string] => [name, name])),
      <T>(content: T) => Promise.resolve(content as t.Hash<T>),
    );

    const values = new Proxy(
      (() => {}) as unknown as
        & Record<string, string>
        & ((args: TemplateStringsArray) => string),
      {
        get: (__, prop) => {
          if (typeof prop === "string" && prop in _.expect) {
            return `(${prop}/(${
              _.expect[prop as keyof typeof _.expect](values)
            }))`;
          }
        },

        apply: (__, ___, argArray: string[]) => {
          return argArray[0][0].split(",").map(
            (a, __, arr) => {
              return a + "->(" + _.edges[a]
                .map((b) => [b.split(":")[0], b.split(":")[1] ?? ""])
                .flatMap(
                  ([b, label]) => [
                    (scc.order(b) > scc.order(a)
                      ? `+${label}:`
                      : `-${label}:`) +
                    (arr.includes(b) ? b : values[b]),
                  ],
                ).join("") +
                ")";
            },
          ).join(",");
        },
      },
    );

    t.test.equals(
      Object.fromEntries(
        Object.keys(_.expect).map((k) => [k, scc.order(k)]),
      ),
      Object.fromEntries(
        Object.keys(_.expect).map((k, i) => [k, i]),
      ),
      "computed order doesn't match dfs order",
    );

    for (const name of Object.keys(_.expect)) {
      if (!(name in _.edges)) {
        continue;
      }

      t.test.equals(
        signatures.get(name),
        values[name],
      );
    }
  });
}

Deno.test("scc-signature > sign", async (ctx) => {
  await __(ctx, "a -> b -> c", {
    edges: {
      a: ["b"],
      b: ["c"],
      c: [],
    },
    expect: {
      a: (e) => `a->(+:${e.b})`,
      b: (e) => `b->(+:${e.c})`,
      c: (e) => `c->()`,
    },
  });

  await __(ctx, "a -> b -> a", {
    edges: {
      a: ["b"],
      b: ["a"],
    },
    expect: {
      a: (e) => e`a,b`,
      b: (e) => e`a,b`,
    },
  });

  await __(
    ctx,
    "a -> b -> c -> a",
    {
      edges: {
        a: ["b"],
        b: ["c"],
        c: ["a"],
      },
      expect: {
        a: (e) => e`a,b,c`,
        b: (e) => e`a,b,c`,
        c: (e) => e`a,b,c`,
      },
    },
  );

  await __(ctx, "a -> (b, c)", {
    edges: {
      a: ["b", "c"],
      b: [],
      c: [],
    },
    expect: {
      a: (e) => `a->(+:${e.b}+:${e.c})`,
      b: (e) => `b->()`,
      c: (e) => `c->()`,
    },
  });

  await __(ctx, "a -> (b -> d, c -> e)", {
    edges: {
      a: ["b", "c"],
      b: ["d"],
      c: ["e"],
      d: [],
      e: [],
    },
    expect: {
      a: (e) => `a->(+:${e.b}+:${e.c})`,
      b: (e) => `b->(+:${e.d})`,
      d: (e) => `d->()`,
      c: (e) => `c->(+:${e.e})`,
      e: (e) => `e->()`,
    },
  });

  await __(ctx, "a -> (b -> (a, x), y)", {
    edges: {
      a: ["b", "y"],
      b: ["a", "x"],
      x: [],
      y: [],
    },
    expect: {
      a: (e) => e`a,b`,
      b: (e) => e`a,b`,
      x: (e) => `x->()`,
      y: (e) => `y->()`,
    },
  });

  await __(ctx, "a -> (b -> (a, x -> y), y -> x)", {
    edges: {
      a: ["b", "y"],
      b: ["a", "x"],
      x: ["y"],
      y: ["x"],
    },
    expect: {
      a: (e) => e`a,b`,
      b: (e) => e`a,b`,
      x: (e) => e`x,y`,
      y: (e) => e`x,y`,
    },
  });

  await __(ctx, "b -> (a, b, a, c)", {
    edges: {
      a: [],
      b: ["a", "b", "a", "c"],
      c: [],
    },
    expect: {
      b: (e) => `b->(+:${e.a}+:${e.a}+:${e.c})`,
      a: (e) => `a->()`,
      c: (e) => `c->()`,
    },
  });

  await __(ctx, "a", {
    edges: {
      a: ["a"],
    },
    expect: {
      a: (e) => `a->()`,
    },
  });

  await __(ctx, "a -> b -> d -> b, c -> d -> b", {
    edges: {
      a: ["b"],
      b: ["d"],
      c: ["d"],
      d: ["b"],
    },
    expect: {
      a: (e) => `a->(+:${e.b})`,
      c: (e) => `c->(+:${e.d})`,
      b: (e) => e`b,d`,
      d: (e) => e`b,d`,
    },
  });

  await __(ctx, "a -> (c -> d -> b, b -> d)", {
    edges: {
      a: ["c", "b"],
      b: ["d"],
      c: ["d"],
      d: ["b"],
    },
    expect: {
      a: (e) => `a->(+:${e.c}+:${e.b})`,
      c: (e) => `c->(+:${e.d})`,
      d: (e) => e`d,b`,
      b: (e) => e`d,b`,
    },
  });

  await __(ctx, "a -> (b -> d -> b, c -> d)", {
    edges: {
      a: ["b", "c"],
      b: ["d"],
      c: ["d"],
      d: ["b"],
    },
    expect: {
      a: (e) => `a->(+:${e.b}+:${e.c})`,
      c: (e) => `c->(+:${e.d})`,
      b: (e) => e`b,d`,
      d: (e) => e`b,d`,
    },
  });

  await __(ctx, "left -> right", {
    edges: {
      left: ["right:foo", "right:bar"],
      right: [],
    },
    expect: {
      left: (e) => `left->(+foo:${e.right}+bar:${e.right})`,
      right: (e) => `right->()`,
    },
  });

  await __(ctx, "left -> right", {
    edges: {
      left: ["right:bar", "right:foo"],
      right: ["left:baz", "left:qux"],
    },
    expect: {
      left: (e) => e`left,right`,
      right: (e) => e`left,right`,
    },
  });
});
