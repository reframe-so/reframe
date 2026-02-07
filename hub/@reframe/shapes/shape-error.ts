export class ShapeError extends Error {
  #next?: Generator<ShapeError>;

  path: string;
  value: unknown;

  next() {
    const item = this.#next?.next();

    if (item?.done) {
      return undefined;
    }

    return item?.value.withNext(this.#next);
  }

  withNext(next?: Generator<ShapeError>) {
    this.#next = (function* (prev) {
      if (prev) {
        yield* prev;
      }

      if (next) {
        yield* next;
      }
    })(this.#next);

    return this;
  }

  constructor(
    path: string,
    message: string,
    value: unknown,
    next?: Generator<ShapeError>,
  ) {
    super(
      `[${path}] ${message}, received: ${JSON.stringify(value)}`,
    );

    this.#next = next;
    this.name = "ShapeError";
    this.path = path;
    this.value = value;
  }

  static from(path: string, message: string, value: unknown) {
    const error = new ShapeError(path, message, value);
    if ("captureStackTrace" in Error) {
      Error.captureStackTrace(error, this.from);
    }
    return error;
  }

  print(
    { values = true, all = false }: { values?: boolean; all?: boolean } = {},
  ) {
    const format = (path: string, message: string, value: unknown) =>
      `[${path}] ${message}${
        values ? `, received: ${JSON.stringify(value)}` : ""
      }`;

    const messages = [format(this.path, this.message, this.value)];

    if (all) {
      while (true) {
        const next = this.next();

        if (!next) {
          break;
        }

        messages.push(format(next.path, next.message, next.value));
      }
    }

    return messages.join("\n");
  }

  static merge(errors: Generator<ShapeError>) {
    const first = errors.next();

    if (first.done) {
      return new ShapeError("", "unknown error", "");
    }

    const error = first.value.withNext(errors);

    if ("captureStackTrace" in Error) {
      Error.captureStackTrace(error, this.merge);
    }

    return error;
  }
}
