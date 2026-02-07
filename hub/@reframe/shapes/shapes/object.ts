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

export interface Object<
  T extends Record<string, Shape>,
> extends Shape {
  [KIND]: "object";
  properties: T;

  readonly [IN]: {
    [K in keyof T]: KindIn<T[K], this[REFS]>;
  };
  readonly [OUT]: {
    [K in keyof T]: KindOut<T[K], this[REFS]>;
  };
}

export const object = <T extends Record<string, Shape>>(
  properties: T,
  _?: { keepExtra?: boolean },
) =>
  shape<Object<T>>(
    {
      [KIND]: "object",
      properties,

      parse: function* (value, opts) {
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          yield ShapeError.from(opts.path, "expected an object", value);
          return [];
        }

        const result = yield* Result.all(
          ...Object.entries(properties)
            .map(([key, shape]) =>
              Result.map(
                shape.parse(
                  Reflect.get(value, key),
                  {
                    ...opts,
                    path: `${opts.path}.${key}`,
                  },
                ),
                (value) => [key, value] as const,
              )
            ),
        );

        return result.map(
          (entries) =>
            _?.keepExtra
              ? {
                ...value,
                ...Object.fromEntries(entries),
              }
              : Object.fromEntries(entries),
        ) as ([
          typeof opts.action extends "read" ? Object<T>[OUT] : Object<T>[IN],
        ] | []);
      },
    },
  );
