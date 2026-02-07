import { IN, KIND, OUT, Shape, ShapeError } from "../core.ts";
import { shape } from "./factory.ts";

export interface Null extends Shape {
  [KIND]: "null";
  readonly [IN]: null;
  readonly [OUT]: null;
}

const null_ = () =>
  shape<Null>(
    {
      [KIND]: "null",
      parse: function* (value, { path }) {
        if (value !== null) {
          yield ShapeError.from(path, "expected null", value);
          return [];
        }

        return [value];
      },
    },
  );

export { null_ as null };
