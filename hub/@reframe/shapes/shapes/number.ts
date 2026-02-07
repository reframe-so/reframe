import { IN, KIND, OUT, Shape, ShapeError } from "../core.ts";
import { shape } from "./factory.ts";

export interface Number extends Shape {
  [KIND]: "number";
  [IN]: number;
  [OUT]: number;
}

export const number = () =>
  shape<Number>({
    [KIND]: "number",
    parse: function* (value, { path }) {
      if (typeof value !== "number") {
        yield ShapeError.from(path, "expected a number", value);
        return [];
      }

      return [value];
    },
  });

export const isNumber = (
  shape: Shape,
): shape is Number => shape[KIND] === "number";
