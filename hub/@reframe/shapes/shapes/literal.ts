import { IN, KIND, OUT, Shape, ShapeError } from "../core.ts";
import { shape } from "./factory.ts";

export interface Literal<T extends string | number | boolean> extends Shape {
  [KIND]: "literal";
  readonly const: T;
  readonly [IN]: T;
  readonly [OUT]: T;
}

export const literal = <T extends string | number | boolean>(value: T) =>
  shape<Literal<T>>(
    {
      [KIND]: "literal",
      const: value,
      parse: function* (v, opts) {
        if (v !== value) {
          yield ShapeError.from(opts.path, `expected literal ${value}`, v);
          return [];
        }

        return [value];
      },
    },
  );
