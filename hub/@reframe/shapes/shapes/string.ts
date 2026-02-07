import { IN, KIND, OUT, Shape, ShapeError } from "../core.ts";
import { shape } from "./factory.ts";

export interface String extends Shape {
  [KIND]: "string";
  readonly [IN]: string;
  readonly [OUT]: string;
}

export const string = () =>
  shape<String>(
    {
      [KIND]: "string",
      parse: function* (value, { path }) {
        if (typeof value !== "string") {
          yield ShapeError.from(path, "expected a string", value);
          return [];
        }

        return [value];
      },
    },
  );
