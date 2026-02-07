import { t as s } from "@reframe/shapes/main.ts";

export type InputValue = string | number | null | Uint8Array;

const ColumnKind = Symbol("ColumnKind");

export type ColumnHint =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "null"
  | "union"
  | "blob";

export type ColumnShape<T extends s.Shape> = T & {
  [ColumnKind]: ColumnHint;
  hint: () => ColumnHint;
};

export const column = <T extends s.Shape>(hint: ColumnHint, shape: T) => {
  Reflect.set(shape, ColumnKind, hint);
  Reflect.set(shape, "hint", (): ColumnHint => hint);

  return shape as ColumnShape<T>;
};

export const nullable = <T extends ColumnShape<s.Shape>>(shape: T) =>
  union([shape, _null()]);

export const isColumn = (value: any): value is ColumnShape<s.Shape> =>
  ColumnKind in value;

export const boolean = () =>
  column(
    "boolean",
    s.transformer(
      s.decoder(
        s.union([s.literal(0), s.literal(1)]),
        (value) => value === 1 ? true : false,
      ),
      s.encoder(s.boolean(), (value) => value ? 1 : 0),
    ),
  );

export const date = () =>
  column(
    "string",
    s.transformer(
      s.decoder(
        s.string(),
        (value) => new Date(value),
      ),
      s.encoder(
        s.instanceOf(Date),
        (value) => value.toISOString(),
      ),
    ),
  );

export const jsonSchema = <T extends s.Shape>(
  fn: (_: typeof s) => s.Extended<T>,
) => {
  return column(
    "json",
    s.transformer(
      s.decoder(
        s.string(),
        (value) => fn(s).read(JSON.parse(value)),
      ),
      s.encoder(
        fn(s),
        (value) => JSON.stringify(value),
      ),
    ),
  );
};

export const json = () => {
  return jsonSchema((s) => {
    const json = s.union([
      s.null(),
      s.boolean(),
      s.number(),
      s.string(),
      s.array(s.ref("json")),
      s.record(s.string(), s.ref("json")),
    ]);

    return s.withRef(json, { json });
  });
};

export const array = <T extends s.Shape>(shape: T) =>
  column("json", s.array(shape));

new Uint8Array();

export const blob = () =>
  column("blob", s.instanceOf<Uint8Array<ArrayBuffer>>(Uint8Array));

export const literal = <T extends string | number | boolean>(value: T) =>
  column(
    typeof value === "string"
      ? "string"
      : typeof value === "number"
      ? "number"
      : typeof value === "boolean"
      ? "boolean"
      : "blob",
    s.literal(value),
  );

const _null = () => column("null", s.null());
export { _null as null };

export const number = () => column("number", s.number());

export const object = <T extends Record<string, s.Shape>>(propteries: T) =>
  column("json", s.object(propteries));

export const record = <
  K extends s.Shape & {
    [s.IN]: string;
    [s.OUT]: string;
  },
  V extends s.Shape,
>(
  key: K,
  value: V,
) => column("json", s.record(key, value));

export const string = () => column("string", s.string());

export const tuple = <T extends s.Shape[]>(shapes: [...T]) =>
  column("json", s.tuple(shapes));

export const union = <T extends ColumnShape<s.Shape>[]>(shapes: [...T]) =>
  column("union", s.union(shapes));

export {
  // type Array,
  type In,
  // type Number,
  // type Object,
  type Out,
  type Shape,
  type ShapeOf,
  // type String,
} from "@reframe/shapes/t.ts";
