import { shape } from "./factory.ts";
import {
  AccessType,
  IN,
  KIND,
  KindIn,
  KindOut,
  OUT,
  Path,
  REFS,
  Shape,
} from "../core.ts";

export interface Access<
  R extends Shape,
  P extends Path,
> extends Shape {
  [KIND]: "access";
  parent: R;
  path: P;

  readonly [IN]: AccessType<
    KindIn<R, this[REFS]>,
    P
  > extends infer K ? K
    : never;
  readonly [OUT]: AccessType<
    KindOut<R, this[REFS]>,
    P
  > extends infer K ? K
    : never;
}

// TODO: this should be part of shape
const at = <T extends Shape>(
  shape: T,
  path: Path,
  {
    defs = {},
  }: {
    defs?: Record<string, Shape>;
    path?: string;
  } = {},
) => {
  /**
   * if (isAccess(shape)) {
   *   const inner = at(shape.parent, shape.path, { defs, path });
   *   return at(inner, path, { defs, path });
   * }
   *
   * if (isRef(shape)) {
   *   return Reflect.get(defs, shape.ref) ?? never(
   *     `invalid ref: ${shape.ref}`,
   *    }
   * }
   *
   * if (isUnion(shape)) {
   *  // make a union of all the properties
   * }
   *
   * if (isIntersection(shape)) {
   *   // find the one that has the property, if any
   * }
   *
   * if (typeof shape === "string" && !isObject(shape) && !isRecord(shape)) {
   *    return never(`property not found: ${name}`, shape);
   * }
   *
   * if (typeof shape === "number" && !isTuple(shape) && !isArray(shape)) {
   *    return never(`property not found: ${name}`, shape);
   * }
   *
   * if (isObject(shape)) {
   *   return Reflect.get(shape.properties, name) ?? never(
   *    `property not found: ${name}`, shape,
   *   );
   * }
   *
   * if (isRecord(shape)) {
   *   if (!shape.key.match(name)) {
   *     return never(
   *       `property not found: ${name}`,
   *        shape,
   *     );
   *   }
   *
   *   return shape.value;
   * }
   *
   * if (typeof name !== "number") {
   *   return never(
   *     `property not found: ${name}`,
   *     shape,
   *   );
   * }
   *
   * if (isTuple(shape)) {
   */
};

export const access = <R extends Shape, P extends Path>(
  parent: R,
  path: [...P],
) =>
  shape<Access<R, [...P]>>(
    {
      [KIND]: "access",
      parent,
      path,
      parse: function* (value, opts) {
        throw new Error("not implemented");
      },
    },
  );
