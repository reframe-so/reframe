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

interface _Record<
  K extends Shape & {
    [IN]: string;
    [OUT]: string;
  },
  V extends Shape,
> extends Shape {
  [KIND]: "record";

  key: K;
  value: V;
  readonly [IN]: {
    [P in KindIn<K, this[REFS]>]: KindIn<V, this[REFS]>;
  };
  readonly [OUT]: {
    [P in KindOut<K, this[REFS]>]: KindOut<V, this[REFS]>;
  };
}

export type { _Record as Record };

export const record = <
  K extends Shape & {
    [IN]: string;
    [OUT]: string;
  },
  V extends Shape,
>(
  key: K,
  value: V,
) =>
  shape<_Record<K, V>>(
    {
      [KIND]: "record",
      key,
      value,

      parse: function* (record, opts) {
        if (
          typeof record !== "object" ||
          record === null ||
          Array.isArray(record)
        ) {
          yield ShapeError.from(opts.path, "expected an object", record);
          return [];
        }

        const result = yield* Result.all(
          ...Object.entries(record)
            .map(([k, v]) =>
              Result.all(
                key.parse(k, { ...opts, path: `${opts.path}.${k}.<key>` }),
                value.parse(v, { ...opts, path: `${opts.path}.${k}` }),
              )
            ),
        );

        return result.map(
          (entries) => Object.fromEntries(entries),
        ) as (
          | [
            typeof opts.action extends "read" ? _Record<K, V>[OUT]
              : _Record<K, V>[IN],
          ]
          | []
        );
      },
    },
  );
