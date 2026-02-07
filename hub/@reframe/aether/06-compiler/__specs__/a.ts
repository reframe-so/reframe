const a = 0;
export { a };
export { a as b };

let b = 0;
export { b as c };

var c = 0;
export { c as d };

export const e = 1;
export let f = 2;
export var g = 3;

const h = () => i;
export { h as ii };

export const i = () => j(h);

export var j = i(a);

let k = 0;
let l = k * b;
export { l as m };

import o, { n, n as m } from "n";
import * as p from "p";

export { n, o, p };

export { default as q, r, s as t } from "r";
export * as s from "s";
export * from "t";

export default u;

function v() {
  return w + c;
}

export { v as ww };

export function w() {
  z = y;
  c = z;
  y = e;
  e = w;
  w = e;
  const kk = {
    a: 1,
    b: w,
    c: w().m,
  };
  return x + d;
}

const mm = () => 5;

export { w as xx };

export function x() {
  z = y;
  c = z;
  y = e;
  return y + e;
}

const y = x(z);
export function z() {
  return 0;
}

export * from "x";
export * from "y";
export * from "z";
