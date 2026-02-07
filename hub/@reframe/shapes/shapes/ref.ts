import {
  IN,
  KIND,
  KindIn,
  KindOut,
  OUT,
  REFS,
  Shape,
  ShapeError,
} from "../core.ts";
import { shape } from "./factory.ts";

type RefKindIn<
  T extends Shape,
  Refs extends Record<string, Shape>,
> = T extends Ref<infer K> ? K extends keyof Refs ? never
  : never
  : KindIn<T, Refs>;

type RefKindOut<
  T extends Shape,
  Refs extends Record<string, Shape>,
> = T extends Ref<infer K> ? K extends keyof Refs ? never
  : never
  : KindOut<T, Refs>;

export interface Ref<K extends string> extends Shape {
  [KIND]: "ref";
  ref: K;
  readonly [IN]: KindIn<
    this[REFS][K],
    this[REFS]
  >;
  readonly [OUT]: KindOut<
    this[REFS][K],
    this[REFS]
  >;
}

export const ref = <K extends string>(name: K) =>
  shape<Ref<K>>(
    {
      [KIND]: "ref",
      ref: name,

      parse: function* (value, opts) {
        const shape = Reflect.get(opts.refs, name);

        if (!shape) {
          yield ShapeError.from(
            opts.path,
            `reference to undefined shape: ${name}`,
            value,
          );

          return [];
        }

        return yield* shape.parse(value, opts);
      },
    },
  );

export interface WithRef<
  T extends Shape,
  Refs extends Record<string, Shape>,
> extends Shape {
  [KIND]: "with-ref";
  ref: T;
  refs: Refs;
  readonly [IN]: KindIn<T, Refs>;
  readonly [OUT]: KindOut<T, Refs>;
}

export const withRef = <
  T extends Shape,
  Refs extends Record<string, Shape>,
>(
  ref: T,
  refs: Refs,
) =>
  shape<WithRef<T, Refs>>(
    {
      [KIND]: "with-ref",
      ref,
      refs,

      parse: function* (value, opts) {
        return yield* ref.parse(value, {
          ...opts,
          refs: {
            ...refs,
            ...opts.refs,
          },
        });
      },
    },
  );

export const recursive = <
  K extends string,
  T extends Shape,
>(name: K, fn: (self: Ref<K>) => T) => {
  const r = ref(name);
  const shape = fn(r);

  return withRef(
    r,
    {
      [name]: shape,
    } as { [P in K]: T },
  );
};
