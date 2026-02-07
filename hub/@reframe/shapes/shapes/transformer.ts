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
import { shape } from "./factory.ts";

export interface Decoder<T extends Shape, I> extends Shape {
  [KIND]: "decoder";
  shape: T;
  readonly [IN]: KindIn<T, this[REFS]>;
  readonly [OUT]: I;
}

export const decoder = <T extends Shape, I>(
  _shape: T,
  decode: (value: Out<T>) => I,
) =>
  shape<Decoder<T, I>>(
    {
      [KIND]: "decoder",
      shape: _shape,
      parse: function* (value, opts) {
        if (opts.action === "write") {
          yield ShapeError.from(
            opts.path,
            "cannot write from decoder",
            value,
          );
          return [];
        }

        try {
          return yield* Result.map(
            _shape.parse(value, opts),
            decode,
          );
        } catch (e) {
          yield (e instanceof ShapeError
            ? e
            : ShapeError.from(opts.path, (e as Error).message, value));
          return [];
        }
      },
    },
  );

export interface Encoder<T extends Shape, O> extends Shape {
  [KIND]: "encoder";
  shape: T;
  readonly [IN]: O;
  readonly [OUT]: KindOut<T, this[REFS]>;
}

export const encoder = <T extends Shape, O>(
  _shape: T,
  encode: (value: In<T>) => O,
) =>
  shape<Encoder<T, O>>(
    {
      [KIND]: "encoder",
      shape: _shape,
      parse: function* (value, opts) {
        if (opts.action === "read") {
          yield ShapeError.from(
            opts.path,
            "cannot read from encoder",
            value,
          );
          return [];
        }

        try {
          return yield* Result.map(
            _shape.parse(value, opts),
            encode,
          );
        } catch (e) {
          yield ShapeError.from(opts.path, (e as Error).message, value);
          return [];
        }
      },
    },
  );

export interface Transformer<
  A extends Shape,
  B extends Shape,
> extends Shape {
  [KIND]: "transformer";
  decoder: Decoder<A, In<B>>;
  encoder: Encoder<B, Out<A>>;

  readonly [IN]: KindIn<A, this[REFS]>;
  readonly [OUT]: KindOut<B, this[REFS]>;
}

export const transformer = <
  A extends Shape,
  B extends Shape,
>(
  decoder: Decoder<A, In<B>>,
  encoder: Encoder<B, Out<A>>,
) =>
  shape<Transformer<A, B>>({
    [KIND]: "transformer",
    decoder,
    encoder,

    parse: function* (value, opts) {
      return yield* (
        opts.action === "write"
          ? encoder.parse(value, opts)
          : decoder.parse(value, opts)
      );
    },
  });
