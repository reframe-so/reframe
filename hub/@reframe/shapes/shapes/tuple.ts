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

export interface Tuple<T extends Shape[]> extends Shape {
  [KIND]: "tuple";
  items: T;
  readonly [IN]: {
    [K in keyof T]: KindIn<T[K], this[REFS]>;
  };
  readonly [OUT]: {
    [K in keyof T]: KindOut<T[K], this[REFS]>;
  };
}

export const tuple = <T extends Shape[]>(items: [...T]) =>
  shape<Tuple<T>>(
    {
      [KIND]: "tuple",
      items,
      parse: function* (value, opts) {
        if (!Array.isArray(value)) {
          yield ShapeError.from(opts.path, "expected a tuple", value);
          return [];
        }

        if (value.length !== items.length) {
          yield ShapeError.from(
            opts.path,
            `expected a tuple of length ${items.length}, got ${value.length}`,
            value,
          );
        }

        return yield* Result.all(
          ...items.map((item, i) =>
            item.parse(value[i], { ...opts, path: `${opts.path}[${i}]` })
          ),
        ) as Result<
          typeof opts.action extends "read" ? Tuple<T>[OUT]
            : Tuple<T>[IN]
        >;
      },
    },
  );
