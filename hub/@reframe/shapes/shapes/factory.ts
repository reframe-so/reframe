import { measure } from "@reframe/aether/00-base/measure.ts";
import {
  IN,
  In,
  KIND,
  KindIn,
  KindOut,
  OUT,
  Out,
  REFS,
  Shape,
  ShapeError,
} from "../core.ts";
import { Result } from "../result.ts";

export interface Nullable<T extends Shape> extends Shape {
  [KIND]: "nullable";
  shape: T;
  readonly [IN]: KindIn<T, this[REFS]> | null;
  readonly [OUT]: KindOut<T, this[REFS]> | null;
}

export const nullable = <T extends Shape>(_shape: T) =>
  shape<Nullable<T>>(
    {
      [KIND]: "nullable",
      shape: _shape,
      parse: function* (value, opts) {
        if (value === null) {
          return [null];
        }

        return yield* _shape.parse(value, opts);
      },
    },
  );

export interface Optional<T extends Shape> extends Shape {
  [KIND]: "optional";
  shape: T;
  readonly [IN]: KindIn<T, this[REFS]> | undefined;
  readonly [OUT]: KindOut<T, this[REFS]> | undefined;
}

export const optional = <T extends Shape>(_shape: T) =>
  shape<Optional<T>>(
    {
      [KIND]: "optional",
      shape: _shape,
      parse: function* (value, opts) {
        if (value === undefined) {
          return [undefined];
        }

        return yield* _shape.parse(value, opts);
      },
    },
  );

export type Extended<T extends Shape> = T & {
  nullable: () => Extended<Nullable<T>>;
  optional: () => Extended<Optional<T>>;

  read: (value: unknown, opts?: {
    refs?: Record<string, Shape>;
    path?: string;
  }) => Out<T>;

  write: (value: unknown, opts?: {
    refs?: Record<string, Shape>;
    path?: string;
  }) => In<T>;
};

const extend = <T extends Shape>(
  shape: T,
) => {
  const peek = <A extends "read" | "write", T>(action: A, value: T, opts?: {
    refs?: Record<string, Shape>;
    path?: string;
  }) =>
    Result.peek(
      shape.parse(value, {
        action,
        refs: opts?.refs ?? {},
        path: opts?.path ?? "$",
      }),
    );

  const self: Extended<T> = {
    nullable: () => nullable(self),
    optional: () => optional(self),

    read: (value, opts) => {
      const [out, errors] = peek("read", value, opts);

      if (out.length > 0) {
        return out[0] as Out<T>;
      }

      const error = ShapeError.merge(errors);
      Error.captureStackTrace?.(error, self.read);
      throw error;
    },

    write: (value, opts) => {
      const [out, errors] = peek("write", value, opts);

      if (out.length > 0) {
        return out[0] as Out<T>;
      }

      const error = ShapeError.merge(errors);
      Error.captureStackTrace?.(error, self.write);
      throw error;
    },

    ...shape,
  };

  self.read = measure("shapes.read", self.read);
  self.write = measure("shapes.write", self.write);

  return self;
};

export const shape = <T extends Shape>(
  rest: Omit<T, IN | OUT | REFS>,
) => extend(rest as T);
