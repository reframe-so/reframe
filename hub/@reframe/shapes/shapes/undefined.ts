import { IN, KIND, OUT, Shape, ShapeError } from "../core.ts";
import { shape } from "./factory.ts";

export interface Undefined extends Shape {
  [KIND]: "undefined";
  readonly [IN]: undefined;
  readonly [OUT]: undefined;
}

const undefined_ = () =>
  shape<Undefined>(
    {
      [KIND]: "undefined",
      parse: function* (value, opts) {
        if (value !== undefined) {
          yield ShapeError.from(opts.path, "expected undefined", value);
          return [];
        }

        return [undefined];
      },
    },
  );

export { undefined_ as undefined };
