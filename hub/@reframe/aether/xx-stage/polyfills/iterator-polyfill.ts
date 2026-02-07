/**
 * Iterator Helpers Polyfill
 *
 * This polyfill implements the TC39 Iterator Helpers proposal for environments
 * that don't natively support it (e.g., older iOS Safari).
 *
 * The types are provided by TypeScript's built-in lib.esnext.iterator.d.ts
 * (included via "lib": ["esnext"] in deno.json), so we only provide the
 * runtime implementation here.
 *
 * @see https://github.com/tc39/proposal-iterator-helpers
 */

//========== Helper functions ==========

function isObject(value: unknown) {
  if (value === null) return false;
  const t = typeof value;
  return t === "object" || t === "function";
}

//========== Helper types (internal only) ==========

interface CoreIterable<T> {
  [Symbol.iterator](): CoreIterator<T>;
}
interface CoreIterator<T> {
  next(): IteratorResult<T>;
}

//========== getIterator ==========

function GetIteratorFlattenable<T>(
  obj: Record<symbol, unknown>,
  _hint: "sync",
): T {
  if (!isObject(obj)) {
    throw new TypeError();
  }
  const method = obj[Symbol.iterator];
  let iterator = undefined;
  if (typeof method !== "function") {
    iterator = obj;
  } else {
    iterator = (method as () => T).call(obj);
  }
  if (!isObject(iterator)) {
    throw new TypeError();
  }
  return iterator as T;
}

//========== Prototype methods implementation ==========

const NO_INITIAL_VALUE = Symbol("NO_INITIAL_VALUE");

/**
 * Abstract base class implementing iterator helper methods.
 * These methods will be copied to Iterator.prototype at runtime.
 */
abstract class AbstractIteratorImpl<T> {
  abstract [Symbol.iterator](): Iterator<T>;
  abstract next(): IteratorResult<T>;

  *map<U>(mapper: (value: T, counter: number) => U): IterableIterator<U> {
    let counter = 0;
    for (const value of this as unknown as Iterable<T>) {
      yield mapper(value, counter);
      counter++;
    }
  }

  *filter(
    filterer: (value: T, counter: number) => boolean,
  ): IterableIterator<T> {
    let counter = 0;
    for (const value of this as unknown as Iterable<T>) {
      if (filterer(value, counter)) {
        yield value;
      }
      counter++;
    }
  }

  *take(limit: number): IterableIterator<T> {
    let counter = 0;
    for (const value of this as unknown as Iterable<T>) {
      if (counter >= limit) break;
      yield value;
      counter++;
    }
  }

  *drop(limit: number): IterableIterator<T> {
    let counter = 0;
    for (const value of this as unknown as Iterable<T>) {
      if (counter >= limit) {
        yield value;
      }
      counter++;
    }
  }

  *flatMap<U>(
    mapper: (value: T, counter: number) => Iterable<U> | Iterator<U>,
  ): IterableIterator<U> {
    let counter = 0;
    for (const value of this as unknown as Iterable<T>) {
      yield* mapper(value, counter) as Iterable<U>;
      counter++;
    }
  }

  reduce<U>(
    reducer: (accumulator: U, value: T, counter: number) => U,
    initialValue: typeof NO_INITIAL_VALUE | U = NO_INITIAL_VALUE,
  ): U {
    let accumulator = initialValue;
    let counter = 0;
    for (const value of this as unknown as Iterable<T>) {
      if (accumulator === NO_INITIAL_VALUE) {
        // When no initial value, first element is used as accumulator
        // This follows JavaScript semantics where T is treated as U
        accumulator = value as unknown as U;
        continue;
      }
      accumulator = reducer(accumulator, value, counter);
      counter++;
    }
    if (accumulator === NO_INITIAL_VALUE) {
      throw new TypeError(
        "Must specify an initialValue if the iterable is empty.",
      );
    }
    return accumulator;
  }

  toArray(): Array<T> {
    const result: T[] = [];
    for (const x of this as unknown as Iterable<T>) {
      result.push(x);
    }
    return result;
  }

  forEach(fn: (value: T, counter: number) => void): void {
    let counter = 0;
    for (const value of this as unknown as Iterable<T>) {
      fn(value, counter);
      counter++;
    }
  }

  some(fn: (value: T, counter: number) => boolean): boolean {
    let counter = 0;
    for (const value of this as unknown as Iterable<T>) {
      if (fn(value, counter)) {
        return true;
      }
      counter++;
    }
    return false;
  }

  every(fn: (value: T, counter: number) => boolean): boolean {
    let counter = 0;
    for (const value of this as unknown as Iterable<T>) {
      if (!fn(value, counter)) {
        return false;
      }
      counter++;
    }
    return true;
  }

  find(fn: (value: T, counter: number) => boolean): T | undefined {
    let counter = 0;
    for (const value of this as unknown as Iterable<T>) {
      if (fn(value, counter)) {
        return value;
      }
      counter++;
    }
    return undefined;
  }
}

//========== Polyfill installation ==========

/** Internal interface for the Iterator constructor used in polyfill installation */
interface IteratorConstructorPolyfill {
  from<U>(iterableOrIterator: CoreIterable<U> | CoreIterator<U>): Iterator<U>;
  new <T, TReturn = unknown, TNext = undefined>(): Iterator<T, TReturn, TNext>;
  readonly prototype: Iterator<unknown>;
}

/** Type-safe accessor for globalThis.Iterator in polyfill context */
type GlobalWithIterator = { Iterator?: IteratorConstructorPolyfill };
const getGlobalIterator = () =>
  (globalThis as unknown as GlobalWithIterator).Iterator;
const setGlobalIterator = (ctor: IteratorConstructorPolyfill) => {
  (globalThis as unknown as GlobalWithIterator).Iterator = ctor;
};

function installIteratorPolyfill() {
  setGlobalIterator(function () {} as unknown as IteratorConstructorPolyfill);

  const IteratorCtor = getGlobalIterator()!;

  Object.defineProperty(IteratorCtor, "prototype", {
    writable: false,
    enumerable: false,
    configurable: false,
    value: Object.getPrototypeOf(
      // Shared prototype of generators:
      Object.getPrototypeOf(function* () {}.prototype),
    ),
  });

  //----- Prototype properties -----

  for (const key of Reflect.ownKeys(AbstractIteratorImpl.prototype)) {
    const value = (
      AbstractIteratorImpl.prototype as unknown as Record<
        string | symbol,
        unknown
      >
    )[key];
    Object.defineProperty(IteratorCtor.prototype, key, {
      writable: false,
      enumerable: false,
      configurable: true,
      value,
    });
  }

  // SPEC: "Unlike the @@toStringTag on most built-in classes, for
  // web-compatibility reasons this property must be writable."
  Object.defineProperty(IteratorCtor.prototype, Symbol.toStringTag, {
    value: "Iterator",
    writable: true,
    enumerable: false,
    configurable: true,
  });

  //----- Static method -----
  // Must be done after Iterator.prototype was set up,
  // so that `extends Iterator` works below

  class WrappedIterator<T, TReturn = unknown, TNext = undefined> {
    #iterator: Iterator<T, TReturn, TNext>;
    constructor(iterator: Iterator<T, TReturn, TNext>) {
      this.#iterator = iterator;
    }
    next(...args: [] | [TNext]): IteratorResult<T, TReturn> {
      return this.#iterator.next(...args);
    }
    return(value?: TReturn | PromiseLike<TReturn>): IteratorResult<T, TReturn> {
      const returnMethod = this.#iterator.return;
      if (returnMethod === undefined) {
        // Per Iterator protocol: if no return method, treat value as TReturn
        return { done: true, value: value as TReturn };
      }
      return returnMethod.call(this.#iterator);
    }
  }

  // Set up prototype chain: WrappedIterator extends Iterator
  Object.setPrototypeOf(WrappedIterator.prototype, IteratorCtor.prototype);

  function Iterator_from<T>(value: Record<symbol, unknown>) {
    const iterator = GetIteratorFlattenable<Iterator<T>>(value, "sync");
    // Check if iterator already has the helper methods
    if (Object.getPrototypeOf(iterator) === IteratorCtor.prototype) {
      return iterator;
    }
    // `iterator` does not support the new API – wrap it so that it does
    return new WrappedIterator(iterator) as unknown as Iterator<T>;
  }

  Object.defineProperty(IteratorCtor, "from", {
    writable: true,
    enumerable: false,
    configurable: true,
    value: Iterator_from,
  });
}

//========== Built-in iterator patching ==========

// Patch built-in iterators to support iterator helper methods
// This is crucial for fixing "r.entries().map is not a function" on older iOS
function patchBuiltInIterators() {
  const IteratorCtor = getGlobalIterator();
  if (!IteratorCtor?.prototype) return;

  // Get the prototypes of built-in iterators
  const mapIteratorPrototype = Object.getPrototypeOf(new Map().entries());
  const setIteratorPrototype = Object.getPrototypeOf(new Set().values());
  const arrayIteratorPrototype = Object.getPrototypeOf([].values());

  // Also handle string iterator
  const stringIteratorPrototype = Object.getPrototypeOf(""[Symbol.iterator]());

  const builtInIteratorPrototypes = [
    mapIteratorPrototype,
    setIteratorPrototype,
    arrayIteratorPrototype,
    stringIteratorPrototype,
  ];

  // Copy iterator helper methods to built-in iterator prototypes
  for (const prototype of builtInIteratorPrototypes) {
    if (prototype && prototype !== IteratorCtor.prototype) {
      for (const key of Reflect.ownKeys(IteratorCtor.prototype)) {
        if (key === "constructor" || key === Symbol.toStringTag) continue;
        if (key in (prototype as object)) continue; // Don't override existing methods

        const descriptor = Object.getOwnPropertyDescriptor(
          IteratorCtor.prototype,
          key,
        );
        if (descriptor && typeof descriptor.value === "function") {
          try {
            Object.defineProperty(prototype, key, {
              ...descriptor,
              configurable: true,
            });
          } catch (_e) {
            // Silently ignore if we can't patch (some browsers may be restrictive)
          }
        }
      }
    }
  }
}

//========== Auto-install ==========

if (!getGlobalIterator()) {
  installIteratorPolyfill();
}

// Apply the patches after the polyfills are installed
patchBuiltInIterators();
