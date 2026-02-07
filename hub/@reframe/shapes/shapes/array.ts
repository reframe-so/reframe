import {
  Ensure,
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
import { Result } from "../result.ts";

type ArrayKindIn<
  T extends Shape,
  Refs extends Record<string, Shape>,
> = Ensure<KindIn<T, Refs>[]>;

type ArrayKindOut<
  T extends Shape,
  Refs extends Record<string, Shape>,
> = Ensure<KindOut<T, Refs>[]>;

interface _Array<T extends Shape> extends Shape {
  [KIND]: "array";
  item: T;
  readonly [IN]: ArrayKindIn<T, this[REFS]>;
  readonly [OUT]: ArrayKindOut<T, this[REFS]>;
}

export type { _Array as Array };

export const array = <T extends Shape>(item: T) =>
  shape<_Array<T>>(
    {
      [KIND]: "array",
      item,
      parse: function* (value, opts) {
        if (!Array.isArray(value)) {
          yield ShapeError.from(opts.path, "expected an array", value);
          return [[]];
        }

        return yield* Result.all(
          ...value.map((v, i) =>
            item.parse(v, { ...opts, path: `${opts.path}[${i}]` })
          ),
        );
      },
    },
  );
