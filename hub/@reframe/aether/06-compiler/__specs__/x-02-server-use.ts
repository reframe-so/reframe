export function Foo() {}

export const Foo1 = Foo;

export { Foo as Foo2 };

export async function Bar() {
  "use server";
}

export const Bar1 = Bar;

export { Bar as Bar2 };

export function Baz() {
  "use client";
}

export const Baz1 = Baz;

export { Baz as Baz2 };
