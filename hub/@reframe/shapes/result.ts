import { ShapeError } from "./shape-error.ts";

export type Result<T> = Generator<ShapeError, [T] | []>;

// deno-lint-ignore require-yield
function* empty(): Generator<ShapeError, []> {
  return [];
}

// deno-lint-ignore require-yield
function* from<T>(value: T): Generator<ShapeError, [T]> {
  return [value];
}

function* recoverError(
  first: ShapeError,
  result: Result<unknown>,
): Generator<ShapeError, []> {
  yield first;
  yield* result;
  return [];
}

const peek = <T>(
  result: Result<T>,
): [[T] | [], Generator<ShapeError, []>] => {
  const first = result.next();

  if (first.done) {
    if (first.value.length === 0) {
      return [[], empty()];
    }

    return [first.value, empty()];
  }

  return [[], recoverError(first.value, result)];
};

type CombineResults<T extends Result<unknown>[]> = {
  [P in keyof T]: T[P] extends Result<infer U> ? U : never;
};

function* all<T extends Result<unknown>[]>(
  ...results: [...T]
): Result<CombineResults<T>> {
  const result = [[]] as (
    [] | [CombineResults<T>]
  );

  for (const r of results) {
    if (result.length === 0) {
      // already failed
      yield* r;
      continue;
    }

    const [r0, r_] = peek(r);

    if (r0.length === 0) {
      yield* r_;
      result.pop();
      continue;
    }

    result[0].push(r0[0]);
  }

  return result;
}

function* any<T extends Result<unknown>[]>(
  ...results: [...T]
): Result<CombineResults<T>[number]> {
  const errors: Generator<ShapeError, []>[] = [];

  for (const r of results) {
    const [r0, r_] = peek(r);

    if (r0.length > 0) {
      return r0 as [CombineResults<T>[number]];
    }

    errors.push(r_);
  }

  for (const e of errors) {
    yield* e;
  }

  return [];
}

function* map<A, B>(
  result: Result<A>,
  fn: (value: A) => B,
): Result<B> {
  const [a0, a_] = peek(result);

  if (a0.length > 0) {
    return [fn(a0[0]!)];
  }

  yield* a_;

  return [];
}

export const Result = {
  all,
  any,
  map,
  empty,
  from,
  peek,
};
