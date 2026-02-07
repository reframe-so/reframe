import { IN, KIND, OUT, Shape, ShapeError } from "../core.ts";
import { shape } from "./factory.ts";

export interface Boolean extends Shape {
  [KIND]: "boolean";
  readonly [IN]: boolean;
  readonly [OUT]: boolean;
}

export const boolean = () =>
  shape<Boolean>(
    {
      [KIND]: "boolean",
      parse: function* (value, { path }) {
        if (typeof value !== "boolean") {
          yield ShapeError.from(path, "expected a boolean", value);
          return [];
        }

        return [value];
      },
    },
  );
