export function Foo() {
  "use client";
  return 5;
}

export const Foo1 = Foo;

export function Bar() {
  return 5;
}

export const Bar1 = Bar;

const Baz = () => {
  "use client";
  return 5;
};

export const Baz1 = Baz;

const Qux = () => {
  return 5;
};

export const Qux1 = Qux;

const A = () => {
  "use client";
};

const B = () => {
  return 5;
};

const C = () => {
  "use client";
};

function D() {
  return 5;
}

export { A, B };

export default D;
