// /path/to/foo.tsx
// export const foo = "foo";
// export const bar = "bar";
// export const baz = "baz";

const x = await import(`jjl${x}`);
const foo1 = await import(`/path/to/foo`);
const foo2 = await import("/path/to/foo", {
  with: { type: "json", mode: "async" },
});
console.log(foo2); // { foo: ..., bar: ..., baz: ... }

const bar = await import("/path/to/foo", { symbols: ["foo", "bar"] });
console.log(bar); // { foo: ..., bar: ... }

const baz = () => import("/path/to/foo", { symbols: [] });

function gg() {
  return import("./path/to/foo", {
    symbols: ["foo"],
    with: { x: "a" },
  });
}
