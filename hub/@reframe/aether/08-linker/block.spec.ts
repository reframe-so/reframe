import { assertEquals } from "jsr:@std/assert";
import * as t from "./t.ts";
import { link } from "./block.mock.ts";

function h<T>(str: TemplateStringsArray): T {
  return str[0] as T;
}

function __(
  { step }: Deno.TestContext,
  name: string,
  // deno-lint-ignore no-explicit-any
  options: any,
) {
  return step(name, async () => {
    // make hash short
    const result = await link({ source: options.source, entry: options.entry });

    result.blocks.forEach(([_index, block]) => {
      block.signature = block.signature.slice(0, 6) as typeof block.signature;
    });

    assertEquals(result, options.result);
  });
}

Deno.test({ name: "linker" }, async (ctx) => {
  await __(ctx, "entry (client + server)", {
    entry: {
      specifier: new t.Specifier("yan", "/entry.ts", {}),
      export: "*",
      targets: ["client", "server"],
    },
    source: {
      "/~yan/()/entry.ts": `
        export { server1 } from "./server.ts" with { env: "server" };
        // export { foo } from "./server.ts" with { env: "server" };
        export { client } from "./client.ts" with { env: "client" };

        // import { server2 } from "./server.ts" with { env: "server" };

        // export default server2;
      `,
      "/~yan/()/server.ts": `
        const server11 = 1;
        const server22 = 1;
        export * as foo from "./foo.ts";

        export { server11 as server1, server22 as server2 };
      `,
      "/~yan/()/foo.ts": `
        export const foo1 = 1;
        export const foo2 = 1;
        export const foo3 = 1;
      `,
      "/~yan/()/client.ts": `
        export const client = 1;
      `,
    },
    result: {
      version: 1,
      modules: [
        [
          "/~yan/(env=client)/entry.ts",
          {
            blocks: [],
            source:
              "8598d62fba71273b0acb0ed9716c3d9291cebdd26a013628865d2f45c17d661d",
            exports: [
              [
                "server1",
                [
                  [
                    "client",
                    {
                      specifier: "/~yan/(env=server)/server.ts",
                      name: "server11",
                    },
                  ],
                ],
              ],
              ["client", [["client", { block: 1, name: "client" }]]],
            ],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/entry.ts",
          {
            blocks: [],
            source:
              "8598d62fba71273b0acb0ed9716c3d9291cebdd26a013628865d2f45c17d661d",
            exports: [
              ["server1", [["server", { block: 0, name: "server11" }]]],
              [
                "client",
                [
                  [
                    "server",
                    {
                      specifier: "/~yan/(env=client)/client.ts",
                      name: "client",
                    },
                  ],
                ],
              ],
            ],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/server.ts",
          {
            blocks: [[0, 0]],
            source:
              "1d1484186fb0bf95129eb1e1f5cc95e83b253449ce048c9468036d6ba287aac5",
            exports: [
              [
                "server1",
                [
                  [
                    "client",
                    {
                      specifier: "/~yan/(env=server)/server.ts",
                      name: "server11",
                    },
                  ],
                  ["server", { block: 0, name: "server11" }],
                ],
              ],
            ],
            references: [["server11", { block: 0, name: "server11" }]],
          },
        ],
        [
          "/~yan/(env=client)/client.ts",
          {
            blocks: [[0, 1]],
            source:
              "04525316a6500866e2e8282ad631ef183395253817c9ca446ba5ab010c13cf47",
            exports: [
              [
                "client",
                [
                  ["client", { block: 1, name: "client" }],
                  [
                    "server",
                    {
                      specifier: "/~yan/(env=client)/client.ts",
                      name: "client",
                    },
                  ],
                ],
              ],
            ],
            references: [["client", { block: 1, name: "client" }]],
          },
        ],
      ],
      blocks: [
        [
          1,
          {
            specifier: "/~yan/(env=client)/client.ts",
            index: 0,
            target: "client",
            uses: [],
            dynamic: [],
            signature: h`n9vP4d`,
          },
        ],
        [
          0,
          {
            specifier: "/~yan/(env=server)/server.ts",
            index: 0,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`BHgu1e`,
          },
        ],
      ],
      order: [
        [1, 0],
        [0, 1],
      ],
    },
  });

  await __(ctx, "foo <> bar", {
    entry: {
      specifier: new t.Specifier("yan", "/left.ts", {}),
      export: "default",
      targets: ["server"],
    },
    source: {
      "/~yan/()/left.ts": `
        import { foo, bar } from "./right.ts";

        export default foo + bar;
      `,
      "/~yan/()/right.ts": `
        export const [foo, bar] = "bar";
      `,
    },
    result: {
      version: 1,
      modules: [
        [
          "/~yan/(env=server)/left.ts",
          {
            blocks: [[0, 0]],
            source:
              "57a067b1d2daabc587229a9c9352c42383570784c8c9fb9dee7fdd557f9ea269",
            exports: [["default", [["server", { block: 0, name: "default" }]]]],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/right.ts",
          {
            blocks: [[0, 1]],
            source:
              "d09f3bdf359ae73bf31fb1a01c465d8e90dbdf910239424a5c4f71dcc6126751",
            exports: [
              ["foo", [["server", { block: 1, name: "foo" }]]],
              ["bar", [["server", { block: 1, name: "bar" }]]],
            ],
            references: [],
          },
        ],
      ],
      blocks: [
        [
          0,
          {
            specifier: "/~yan/(env=server)/left.ts",
            index: 0,
            target: "server",
            uses: [
              ["foo", { block: 1, name: "foo" }],
              ["bar", { block: 1, name: "bar" }],
            ],
            dynamic: [],
            signature: h`cvLlOj`,
          },
        ],
        [
          1,
          {
            specifier: "/~yan/(env=server)/right.ts",
            index: 0,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`8UieS/`,
          },
        ],
      ],
      order: [
        [0, 0],
        [1, 1],
      ],
    },
  });

  await __(ctx, "foo <> middle <> bar", {
    entry: {
      specifier: new t.Specifier("yan", "/left.ts", {}),
      export: "default",
      targets: ["server"],
    },
    source: {
      "/~yan/()/left.ts": `
        import { foo, bar } from "./middle.ts";

        export default foo + bar;
      `,
      "/~yan/()/middle.ts": `
        export { foo, bar } from "./right.ts";
      `,
      "/~yan/()/right.ts": `
        export const [foo, bar] = "bar";
      `,
    },
    result: {
      version: 1,
      modules: [
        [
          "/~yan/(env=server)/left.ts",
          {
            blocks: [[0, 0]],
            source:
              "57a067b1d2daabc587229a9c9352c42383570784c8c9fb9dee7fdd557f9ea269",
            exports: [["default", [["server", { block: 0, name: "default" }]]]],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/middle.ts",
          {
            blocks: [],
            source:
              "f80b9edaf117a3ddf1e430a79d541de478aedecbcf4e17e02199e9bfb72ee3de",
            exports: [
              ["foo", [["server", { block: 1, name: "foo" }]]],
              ["bar", [["server", { block: 1, name: "bar" }]]],
            ],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/right.ts",
          {
            blocks: [[0, 1]],
            source:
              "d09f3bdf359ae73bf31fb1a01c465d8e90dbdf910239424a5c4f71dcc6126751",
            exports: [
              ["foo", [["server", { block: 1, name: "foo" }]]],
              ["bar", [["server", { block: 1, name: "bar" }]]],
            ],
            references: [],
          },
        ],
      ],
      blocks: [
        [
          0,
          {
            specifier: "/~yan/(env=server)/left.ts",
            index: 0,
            target: "server",
            uses: [
              ["foo", { block: 1, name: "foo" }],
              ["bar", { block: 1, name: "bar" }],
            ],
            dynamic: [],
            signature: h`cvLlOj`,
          },
        ],
        [
          1,
          {
            specifier: "/~yan/(env=server)/right.ts",
            index: 0,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`8UieS/`,
          },
        ],
      ],
      order: [
        [0, 0],
        [1, 1],
      ],
    },
  });

  await __(ctx, "foo <> flip <> bar (rename)", {
    entry: {
      specifier: new t.Specifier("yan", "/left.ts", {}),
      export: "default",
      targets: ["server"],
    },
    source: {
      "/~yan/()/left.ts": `
        import { foo, bar } from "./middle.ts";

        export default foo + bar;
      `,
      "/~yan/()/middle.ts": `
        export { bar as foo, foo as bar } from "./right.ts";
      `,
      "/~yan/()/right.ts": `
        export const [foo, bar] = "bar";
      `,
    },
    result: {
      version: 1,
      modules: [
        [
          "/~yan/(env=server)/left.ts",
          {
            blocks: [[0, 0]],
            source:
              "57a067b1d2daabc587229a9c9352c42383570784c8c9fb9dee7fdd557f9ea269",
            exports: [["default", [["server", { block: 0, name: "default" }]]]],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/middle.ts",
          {
            blocks: [],
            source:
              "f80b9edaf117a3ddf1e430a79d541de478aedecbcf4e17e02199e9bfb72ee3de",
            exports: [
              ["foo", [["server", { block: 1, name: "bar" }]]],
              ["bar", [["server", { block: 1, name: "foo" }]]],
            ],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/right.ts",
          {
            blocks: [[0, 1]],
            source:
              "d09f3bdf359ae73bf31fb1a01c465d8e90dbdf910239424a5c4f71dcc6126751",
            exports: [
              ["bar", [["server", { block: 1, name: "bar" }]]],
              ["foo", [["server", { block: 1, name: "foo" }]]],
            ],
            references: [],
          },
        ],
      ],
      blocks: [
        [
          0,
          {
            specifier: "/~yan/(env=server)/left.ts",
            index: 0,
            target: "server",
            uses: [
              ["foo", { block: 1, name: "bar" }],
              ["bar", { block: 1, name: "foo" }],
            ],
            dynamic: [],
            signature: h`5zASTo`,
          },
        ],
        [
          1,
          {
            specifier: "/~yan/(env=server)/right.ts",
            index: 0,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`8UieS/`,
          },
        ],
      ],
      order: [
        [0, 0],
        [1, 1],
      ],
    },
  });

  await __(ctx, "foo <> flip <> bar (namespace)", {
    entry: {
      specifier: new t.Specifier("yan", "/left.ts", {}),
      export: "default",
      targets: ["server"],
    },
    source: {
      "/~yan/()/left.ts": `
        import { foo, bar } from "./middle.ts";

        export default foo + bar;
      `,
      "/~yan/()/middle.ts": `
        export * as foo from "./right.ts";
        export * as bar from "./right.ts";
      `,
      "/~yan/()/right.ts": `
        export const [foo, bar] = "bar";
      `,
    },
    result: {
      version: 1,
      modules: [
        [
          "/~yan/(env=server)/left.ts",
          {
            blocks: [[0, 0]],
            source:
              "57a067b1d2daabc587229a9c9352c42383570784c8c9fb9dee7fdd557f9ea269",
            exports: [["default", [["server", { block: 0, name: "default" }]]]],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/middle.ts",
          {
            blocks: [],
            source:
              "f80b9edaf117a3ddf1e430a79d541de478aedecbcf4e17e02199e9bfb72ee3de",
            exports: [
              [
                "foo",
                [
                  [
                    "server",
                    [
                      ["foo", { block: 1, name: "foo" }],
                      ["bar", { block: 1, name: "bar" }],
                    ],
                  ],
                ],
              ],
              [
                "bar",
                [
                  [
                    "server",
                    [
                      ["foo", { block: 1, name: "foo" }],
                      ["bar", { block: 1, name: "bar" }],
                    ],
                  ],
                ],
              ],
            ],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/right.ts",
          {
            blocks: [[0, 1]],
            source:
              "d09f3bdf359ae73bf31fb1a01c465d8e90dbdf910239424a5c4f71dcc6126751",
            exports: [
              ["foo", [["server", { block: 1, name: "foo" }]]],
              ["bar", [["server", { block: 1, name: "bar" }]]],
            ],
            references: [],
          },
        ],
      ],
      blocks: [
        [
          0,
          {
            specifier: "/~yan/(env=server)/left.ts",
            index: 0,
            target: "server",
            uses: [
              [
                "foo",
                [
                  ["foo", { block: 1, name: "foo" }],
                  ["bar", { block: 1, name: "bar" }],
                ],
              ],
              [
                "bar",
                [
                  ["foo", { block: 1, name: "foo" }],
                  ["bar", { block: 1, name: "bar" }],
                ],
              ],
            ],
            dynamic: [],
            signature: h`pul4+1`,
          },
        ],
        [
          1,
          {
            specifier: "/~yan/(env=server)/right.ts",
            index: 0,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`8UieS/`,
          },
        ],
      ],
      order: [
        [0, 0],
        [1, 1],
      ],
    },
  });

  await __(ctx, "two files (reexport default)", {
    entry: {
      specifier: new t.Specifier("yan", "/a.ts", {}),
      export: "default",
      targets: ["server"],
    },
    source: {
      "/~yan/()/a.ts": `
        export { default } from "./b.ts";
      `,
      "/~yan/()/b.ts": `
        export default 1;
      `,
    },
    result: {
      version: 1,
      modules: [
        [
          "/~yan/(env=server)/a.ts",
          {
            blocks: [],
            source:
              "5b597fb84fb188443479c9595aeed798cf3d87d36acb003e104dbff67981f72a",
            exports: [["default", [["server", { block: 0, name: "default" }]]]],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/b.ts",
          {
            blocks: [[0, 0]],
            source:
              "50ed021aea3231a8cfbe068fd589339b02741825d81a3c8fe6a483b43e32e1f7",
            exports: [["default", [["server", { block: 0, name: "default" }]]]],
            references: [],
          },
        ],
      ],
      blocks: [
        [
          0,
          {
            specifier: "/~yan/(env=server)/b.ts",
            index: 0,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`kAdWjb`,
          },
        ],
      ],
      order: [[0, 0]],
    },
  });

  await __(ctx, "two files (import default)", {
    entry: {
      specifier: new t.Specifier("yan", "/a.ts", {}),
      export: "a",
      targets: ["server"],
    },
    source: {
      "/~yan/()/a.ts": `
        import x from "./b.ts";
        export const a = x;
        export const f = () => x;
      `,
      "/~yan/()/b.ts": `
        export default 1;
        const a = 1;
      `,
    },
    result: {
      version: 1,
      modules: [
        [
          "/~yan/(env=server)/a.ts",
          {
            blocks: [[0, 0]],
            source:
              "ce3643a216ef4355f45e067714f917f409c91989765f464500e1025a1a448515",
            exports: [["a", [["server", { block: 0, name: "a" }]]]],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/b.ts",
          {
            blocks: [[0, 1]],
            source:
              "2cf96249071de0909a96aabab8a12c4c82074b04cf40374eea5584d47b5933fe",
            exports: [["default", [["server", { block: 1, name: "default" }]]]],
            references: [],
          },
        ],
      ],
      blocks: [
        [
          0,
          {
            specifier: "/~yan/(env=server)/a.ts",
            index: 0,
            target: "server",
            uses: [["x", { block: 1, name: "default" }]],
            dynamic: [],
            signature: h`dPfsui`,
          },
        ],
        [
          1,
          {
            specifier: "/~yan/(env=server)/b.ts",
            index: 0,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`eKppZw`,
          },
        ],
      ],
      order: [
        [0, 0],
        [1, 1],
      ],
    },
  });

  await __(ctx, "reexports", {
    entry: {
      specifier: new t.Specifier("yan", "/a.ts", {}),
      export: "x",
      targets: ["server"],
    },
    source: {
      "/~yan/()/a.ts": `
        import * as t from "./b.ts";
        export const x = [t.a, t.b, t.c];
      `,
      "/~yan/()/b.ts": `
        export * from "./c.ts";
        export const a = 1;
        export const b = 1;
        export const z = 5;
      `,
      "/~yan/()/c.ts": `
         export const c = 1;
         export const p = 10;
      `,
    },
    result: {
      version: 1,
      modules: [
        [
          "/~yan/(env=server)/a.ts",
          {
            blocks: [[0, 0]],
            source:
              "74c0fef2ac9afeeb727bfbecb5ddfee5527d2a4df0914fc042c3d4f7b8c90b18",
            exports: [["x", [["server", { block: 0, name: "x" }]]]],
            references: [],
          },
        ],
        [
          "/~yan/(env=server)/b.ts",
          {
            blocks: [
              [0, 1],
              [1, 2],
              [2, 3],
            ],
            source:
              "c2d2d9fe2da928439f44e9503bf344113075f55cd5aa4c9164c2f3e4eb399658",
            exports: [
              ["a", [["server", { block: 1, name: "a" }]]],
              ["b", [["server", { block: 2, name: "b" }]]],
              ["z", [["server", { block: 3, name: "z" }]]],
            ],
            references: [],
          },
        ],
        [
          "/~yan/()/c.ts",
          {
            blocks: [
              [0, 4],
              [1, 5],
            ],
            source:
              "fbc34cc3422a3a9c9c9d7ad9aaac4e880db46d2313e583d9566dbd61d0008980",
            exports: [
              ["c", [["server", { block: 4, name: "c" }]]],
              ["p", [["server", { block: 5, name: "p" }]]],
            ],
            references: [],
          },
        ],
      ],
      blocks: [
        [
          0,
          {
            specifier: "/~yan/(env=server)/a.ts",
            index: 0,
            target: "server",
            uses: [
              [
                "t",
                [
                  ["a", { block: 1, name: "a" }],
                  ["b", { block: 2, name: "b" }],
                  ["z", { block: 3, name: "z" }],
                  ["c", { block: 4, name: "c" }],
                  ["p", { block: 5, name: "p" }],
                ],
              ],
            ],
            dynamic: [],
            signature: h`nwwRZo`,
          },
        ],
        [
          5,
          {
            specifier: "/~yan/()/c.ts",
            index: 1,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`EREPES`,
          },
        ],
        [
          4,
          {
            specifier: "/~yan/()/c.ts",
            index: 0,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`bbglw+`,
          },
        ],
        [
          3,
          {
            specifier: "/~yan/(env=server)/b.ts",
            index: 2,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`nv5ypI`,
          },
        ],
        [
          2,
          {
            specifier: "/~yan/(env=server)/b.ts",
            index: 1,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`VV4o+Q`,
          },
        ],
        [
          1,
          {
            specifier: "/~yan/(env=server)/b.ts",
            index: 0,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`wENlES`,
          },
        ],
      ],
      order: [
        [0, 0],
        [5, 5],
        [4, 4],
        [3, 3],
        [2, 2],
        [1, 1],
      ],
    },
  });

  await __(ctx, "server client", {
    entry: {
      specifier: new t.Specifier("yan", "/a.ts", {}),
      export: "x",
      targets: ["server", "client"],
    },
    source: {
      "/~yan/()/a.ts": `
        import { F, C } from "./b.ts";
        export const t = 2;
        export function foo() {
          "use client"
          return F + t;
        }
        export async function bar() {
          "use server"
          return C;
        }
        export const x = [foo, bar];
      `,
      "/~yan/()/b.ts": `
        import { t, foo } from "./a.ts";
        export const F = 1 + foo;
        export const C = 2;
      `,
    },
    result: {
      version: 1,
      modules: [
        [
          "/~yan/(env=server)/a.ts",
          {
            blocks: [
              [1, 0],
              [3, 2],
            ],
            source:
              "fb940f6646ac8c8976ec3313d580afb99111bd671193121c4f9f6b61ca82d5e7",
            exports: [["x", [["server", { block: 0, name: "x" }]]]],
            references: [["bar", { block: 2, name: "bar" }]],
          },
        ],
        [
          "/~yan/(env=client)/a.ts",
          {
            blocks: [
              [1, 1],
              [2, 3],
              [0, 4],
            ],
            source:
              "fb940f6646ac8c8976ec3313d580afb99111bd671193121c4f9f6b61ca82d5e7",
            exports: [
              ["x", [["client", { block: 1, name: "x" }]]],
              ["foo", [["client", { block: 3, name: "foo" }]]],
            ],
            references: [["foo", { block: 3, name: "foo" }]],
          },
        ],
        [
          "/~yan/(env=server)/b.ts",
          {
            blocks: [[1, 5]],
            source:
              "87431e562387bf64dd4c2278bcd7c6638448e1af9b754e87e157b12a3814961a",
            exports: [["C", [["server", { block: 5, name: "C" }]]]],
            references: [],
          },
        ],
        [
          "/~yan/(env=client)/b.ts",
          {
            blocks: [[0, 6]],
            source:
              "87431e562387bf64dd4c2278bcd7c6638448e1af9b754e87e157b12a3814961a",
            exports: [["F", [["client", { block: 6, name: "F" }]]]],
            references: [],
          },
        ],
      ],
      blocks: [
        [
          1,
          {
            specifier: "/~yan/(env=client)/a.ts",
            index: 1,
            target: "client",
            uses: [
              ["foo", { block: 3, name: "foo" }],
              ["bar", { specifier: "/~yan/(env=server)/a.ts", name: "bar" }],
            ],
            dynamic: [],
            signature: h`shQPFI`,
          },
        ],
        [
          2,
          {
            specifier: "/~yan/(env=server)/a.ts",
            index: 3,
            target: "server",
            uses: [["C", { block: 5, name: "C" }]],
            dynamic: [],
            signature: h`VmlDJk`,
          },
        ],
        [
          5,
          {
            specifier: "/~yan/(env=server)/b.ts",
            index: 1,
            target: "server",
            uses: [],
            dynamic: [],
            signature: h`Ybai2d`,
          },
        ],
        [
          3,
          {
            specifier: "/~yan/(env=client)/a.ts",
            index: 2,
            target: "client",
            uses: [
              ["F", { block: 6, name: "F" }],
              ["t", { block: 4, name: "t" }],
            ],
            dynamic: [],
            signature: h`zXruhX`,
          },
        ],
        [
          4,
          {
            specifier: "/~yan/(env=client)/a.ts",
            index: 0,
            target: "client",
            uses: [],
            dynamic: [],
            signature: h`m+W99a`,
          },
        ],
        [
          6,
          {
            specifier: "/~yan/(env=client)/b.ts",
            index: 0,
            target: "client",
            uses: [["foo", { block: 3, name: "foo" }]],
            dynamic: [],
            signature: h`Sj1KUH`,
          },
        ],
        [
          0,
          {
            specifier: "/~yan/(env=server)/a.ts",
            index: 1,
            target: "server",
            uses: [
              ["foo", { specifier: "/~yan/(env=client)/a.ts", name: "foo" }],
              ["bar", { block: 2, name: "bar" }],
            ],
            dynamic: [],
            signature: h`6sK4p0`,
          },
        ],
      ],
      order: [
        [1, 0],
        [2, 5],
        [5, 6],
        [3, 1],
        [4, 3],
        [6, 2],
        [0, 4],
      ],
    },
  });
});
