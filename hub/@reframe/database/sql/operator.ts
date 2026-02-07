import {
  Compilable,
  compilable,
  COMPILE,
  compile,
  Expression,
  INDENT,
  NODENT,
  Operator,
  Out,
  scalar,
  UNDENT,
} from "./core.ts";
import { t as s } from "@reframe/shapes/main.ts";

export const operator = <Name extends string, Args extends unknown[]>(
  name: Name,
  args: [...Args],
  compile: (...args: Args) => Compilable[typeof COMPILE],
): Operator<Name, Args> => ({
  ...scalar((opts) => compile(...args)(opts)),
  name,
  args,
});

export const eq = <L extends Expression<unknown>, R extends L | Out<L>>(
  lhs: L,
  rhs: R,
) =>
  operator("eq", [lhs, rhs], (lhs, rhs) => (opts) => [
    compile(lhs, opts),
    "=",
    compile(rhs, opts),
  ]);

export const is = <L extends Expression<unknown>, R extends L | Out<L>>(
  lhs: L,
  rhs: R,
) =>
  operator("is", [lhs, rhs], (lhs, rhs) => (opts) => [
    compile(lhs, opts),
    "IS",
    compile(rhs, opts),
  ]);

export const neq = <
  L extends Expression<unknown>,
  R extends Expression<Out<L>> | Out<L>,
>(
  lhs: L,
  rhs: R,
) =>
  operator("eq", [lhs, rhs], (lhs, rhs) => (opts) => [
    compile(lhs, opts),
    "!=",
    compile(rhs, opts),
  ]);

export const isNot = <L extends Expression<unknown>, R extends L | Out<L>>(
  lhs: L,
  rhs: R,
) =>
  operator("isNot", [lhs, rhs], (lhs, rhs) => (opts) => [
    compile(lhs, opts),
    "IS NOT",
    compile(rhs, opts),
  ]);

export const or = <P extends Array<Expression<boolean> | boolean>>(
  ...predicates: [...P]
) =>
  operator("or", predicates, (...predicates) => (opts) => {
    if (predicates.length === 0) {
      return ["false"];
    }

    return [
      `(`,
      INDENT,
      predicates
        .map((p) => compile(p, opts))
        .reduce((acc, sql) => [acc, NODENT, "OR", sql]),
      UNDENT,
      `)`,
    ];
  });

export const and = <P extends Array<Expression<boolean> | boolean>>(
  ...predicates: [...P]
) =>
  operator("and", predicates, (...predicates) => (opts) => {
    if (predicates.length === 0) {
      return ["true"];
    }

    return [
      `(`,
      INDENT,
      predicates
        .map((p) => compile(p, opts))
        .reduce((acc, sql) => [acc, NODENT, "AND", sql]),
      UNDENT,
      `)`,
    ];
  });

export const isNull = <T extends Expression<unknown | null>>(value: T) =>
  is(value, null);

export const not = <P extends Expression<boolean>>(predicate: P) =>
  operator("not", [predicate], (predicate) => (opts) => [
    "NOT",
    compile(predicate, opts),
  ]);

export const isNotNull = <T extends Expression<unknown>>(value: T) =>
  isNot(value, null);

export const like = <L extends Expression<string | null>, R extends string>(
  lhs: L,
  rhs: R,
) =>
  operator("like", [lhs, rhs], (lhs, rhs) => (opts) => [
    compile(lhs, opts),
    "LIKE",
    compile(rhs, opts),
  ]);

export const gt = <
  L extends Expression<number | string | null>,
  R extends L | Out<L>,
>(
  lhs: L,
  rhs: R,
) =>
  operator("gt", [lhs, rhs], (lhs, rhs) => (opts) => [
    compile(lhs, opts),
    ">",
    compile(rhs, opts),
  ]);

export const lt = <
  L extends Expression<number | string | null>,
  R extends L | Out<L>,
>(
  lhs: L,
  rhs: R,
) =>
  operator("lt", [lhs, rhs], (lhs, rhs) => (opts) => [
    compile(lhs, opts),
    "<",
    compile(rhs, opts),
  ]);

export const gte = <
  L extends Expression<number | string | null>,
  R extends L | Out<L>,
>(
  lhs: L,
  rhs: R,
) =>
  operator("gte", [lhs, rhs], (lhs, rhs) => (opts) => [
    compile(lhs, opts),
    ">=",
    compile(rhs, opts),
  ]);

export const lte = <
  L extends Expression<number | string | null>,
  R extends L | Out<L>,
>(
  lhs: L,
  rhs: R,
) =>
  operator("lte", [lhs, rhs], (lhs, rhs) => (opts) => [
    compile(lhs, opts),
    "<=",
    compile(rhs, opts),
  ]);

export const in_ = <
  L extends Expression<unknown>,
  R extends Expression<Out<L>> | Out<L>,
>(
  lhs: L,
  rhs: ReadonlyArray<R>,
) =>
  operator("in", [lhs, rhs], (lhs, rhs) => (opts) => {
    if (rhs.length === 0) {
      return ["false"];
    }

    return [
      compile(lhs, opts),
      "IN",
      "(",
      INDENT,
      rhs
        .map((r) => compile(r, opts))
        .reduce((acc, sql) => [acc, NODENT, ",", sql]),
      UNDENT,
      ")",
    ];
  });

export const updateShape = <T extends s.Shape>(shape: T) =>
  s.union([shape, s.object({ $inc: shape }), s.object({ $dec: shape })]);

export type Update<T> =
  | T
  | (T extends number | string ? { $inc: T } | { $dec: T } : never);

export const update = <T>(
  lhs: Expression<T>,
  update: Update<T>,
): Compilable => {
  if (
    typeof update !== "object" ||
    update === null ||
    update instanceof Uint8Array
  ) {
    return compilable((opts) => compile(update, opts));
  }

  if ("$inc" in update && !!update["$inc"]) {
    return compilable((opts) => [
      compile(lhs, opts),
      "+",
      compile(update["$inc"], opts),
    ]);
  }

  if ("$dec" in update && !!update["$dec"]) {
    return compilable((opts) => [
      compile(lhs, opts),
      "-",
      compile(update["$dec"], opts),
    ]);
  }

  throw new Error(`unsupported update expression ${JSON.stringify(update)}`);
};

export const matchShape = <T extends s.Shape>(shape: T) =>
  s.union([
    shape,
    s.object({ $neq: shape }, { keepExtra: true }),
    s.object({ $isNot: shape }, { keepExtra: true }),
    s.object({ $gt: shape }, { keepExtra: true }),
    s.object({ $lt: shape }, { keepExtra: true }),
    s.object({ $gte: shape }, { keepExtra: true }),
    s.object({ $lte: shape }, { keepExtra: true }),
    s.object({ $like: shape }, { keepExtra: true }),
    s.object({ $in: s.array(shape) }, { keepExtra: true }),
  ]);

/**
 * Match type for database queries.
 * Supports equality matching and various comparison operators.
 * The $gt/$lt/$gte/$lte operators work on both strings and numbers.
 */
export type Match<T> =
  | T
  | { $neq: T }
  | { $isNot: T }
  | { $gt: number | string }
  | { $lt: number | string }
  | { $gte: number | string }
  | { $lte: number | string }
  | { $like: string }
  | { $in: T[] };

export const match = <T>(
  lhs: Expression<T>,
  match: Match<T>,
): Expression<boolean> => {
  if (
    typeof match !== "object" ||
    match === null ||
    match instanceof Uint8Array
  ) {
    // @ts-expect-error
    return is(lhs, match);
  }

  const s = lhs as Expression<string | null>;
  const clauses = [] as Expression<boolean>[];

  if ("$in" in match && match["$in"] !== undefined) {
    clauses.push(in_(lhs, match["$in"]));
  }

  if ("$like" in match && match["$like"] !== undefined) {
    clauses.push(like(s, match["$like"]));
  }

  if ("$isNot" in match && match["$isNot"] !== undefined) {
    clauses.push(isNot(lhs, match["$isNot"]));
  }

  const n = lhs as Expression<number | string | null>;
  if ("$gt" in match && match["$gt"] !== undefined) {
    clauses.push(gt(n, match["$gt"]));
  }

  if ("$gte" in match && match["$gte"] !== undefined) {
    clauses.push(gte(n, match["$gte"]));
  }

  if ("$lt" in match && match["$lt"] !== undefined) {
    clauses.push(lt(n, match["$lt"]));
  }

  if ("$lte" in match && match["$lte"] !== undefined) {
    clauses.push(lte(n, match["$lte"]));
  }

  if ("$neq" in match && match["$neq"] !== undefined) {
    clauses.push(neq(lhs, match["$neq"]));
  }

  if (clauses.length === 0) {
    throw new Error(`unsupported match expression ${JSON.stringify(match)}`);
  }

  return and(...clauses);
};
