export { ShapeError } from "./shape-error.ts";
import { Result } from "./result.ts";

export const REFS = Symbol.for("Shapes.Refs");
export type REFS = typeof REFS;

export const IN = Symbol.for("Shapes.In");
export type IN = typeof IN;

export const OUT = Symbol.for("Shapes.Out");
export type OUT = typeof OUT;

export const KIND = Symbol.for("Shapes.Kind");
export type KIND = typeof KIND;

export const ERROR = Symbol.for("Shapes.Error");

export type Err<R extends string, Ctx = never> = {
  [ERROR]: R;
  ctx: Ctx;
};

export type Ensure<T> = T extends infer U ? U : never;
export type Assume<T, U> = T extends U ? T : U;
export type AssumeRefs<
  T extends { readonly [REFS]?: unknown },
> = Assume<
  T[REFS],
  Record<string, Shape>
>;

export interface Shape {
  readonly [KIND]: string;

  readonly [IN]: unknown;
  readonly [OUT]: unknown;
  readonly [REFS]: Record<string, Shape>;

  parse: <A extends "read" | "write">(
    value: unknown,
    opts: {
      action: A;
      refs: Record<string, Shape>;
      path: string;
    },
  ) => Result<A extends "read" ? this[OUT] : this[IN]>;
}

export type ShapeOf<I, O> = Shape & {
  readonly [IN]: I;
  readonly [OUT]: O;
};

export type In<
  T extends {
    [IN]: unknown;
  },
> = T[IN];
export type Out<
  T extends {
    [OUT]: unknown;
  },
> = T[OUT];
export type Type<T extends Shape> = T[OUT];

export type Kind<T extends Shape> = T[KIND];

export type KindIn<
  S extends Shape,
  Refs extends Record<string, Shape>,
> = (S & {
  readonly [REFS]: Refs;
})[IN];

export type KindOut<
  S extends Shape,
  Refs extends Record<string, Shape>,
> = (S & {
  readonly [REFS]: Refs;
})[OUT];

export type RefsOf<T extends { readonly [REFS]?: unknown }> = T[REFS];

export type Path = (string | number)[];

export type JoinPath<P extends Path> = P extends [
  infer K extends string | number,
  ...infer R extends Path,
] ? `.${K}${JoinPath<R>}`
  : "";

export type AccessType<
  T,
  P extends Path,
> = P extends [infer K extends keyof T, ...infer R extends Path]
  ? AccessType<T[K], R>
  : P extends [infer K, ...infer R]
    ? K extends string | number ? Err<`key '${K}' does not exist`, T>
    : Err<`index is not a string or number`, K>
  : T;
