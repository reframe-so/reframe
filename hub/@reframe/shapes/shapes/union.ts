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
import { Result } from "../result.ts";
import { shape } from "./factory.ts";

export interface Union<
  T extends Shape[],
> extends Shape {
  [KIND]: "union";
  items: T;
  readonly [IN]: KindIn<T[number], this[REFS]>;
  readonly [OUT]: KindOut<T[number], this[REFS]>;

  // match: (
  //   value: unknown,
  //   opts?: {
  //     refs?: Record<string, Shape>;
  //     path?: string;
  //   },
  // ) => T[number][];
  // readonly [TYPE]: {
  //   [K in keyof T]: Kind<T[K], this[REFS]>;
  // }[number];
}

export const union = <T extends Shape[]>(items: [...T]) =>
  shape<Union<T>>(
    {
      [KIND]: "union",
      items,
      parse: function* (value, opts) {
        if (items.length === 0) {
          yield ShapeError.from(
            opts.path,
            `empty union`,
            value,
          );

          return [];
        }

        return yield* Result.any(
          ...items.map((item, i) =>
            item.parse(value, { ...opts, path: `${opts.path}(${i})` })
          ),
        );
      },
    },
  );
