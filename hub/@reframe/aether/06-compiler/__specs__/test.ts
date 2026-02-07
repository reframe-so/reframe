import { C, F } from "./b.ts";
export const t = 2;
export function foo() {
  "use client";
  return F + t;
}
export async function bar() {
  "use server";
  return C;
}
export const x = [foo, bar];

debugger;
