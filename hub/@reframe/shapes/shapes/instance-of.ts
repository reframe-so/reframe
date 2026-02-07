import { IN, KIND, OUT, Shape, ShapeError } from "../core.ts";
import { shape } from "./factory.ts";

export interface InstanceOf<
  T,
> extends Shape {
  [KIND]: "instance-of";
  readonly [IN]: T;
  readonly [OUT]: T;
}

export const instanceOf = <
  T,
>(type: new (...args: unknown[]) => T) =>
  shape<InstanceOf<T>>(
    {
      [KIND]: "instance-of",
      parse: function* (value, { path }) {
        if (!(value instanceof type)) {
          yield ShapeError.from(
            path,
            "expected an instance of " + type.name,
            value,
          );
          return [];
        }

        return [value];
      },
    },
  );
