/**
 * surprise (noun)
 *  /səˈprʌɪz/
 *  an event that doesn't match what was expected
 */

import { parseStackTrace, printStackTrace } from "./utils.ts";

// degree of surprise
export type Degree =
  /**
   * this is an catastrophic surprise
   * @impact it could kill the company
   * @action shut down all systems and resolve this immediately
   *
   * examples:
   * - security vulnerability that will let anyone access customer data
   * - a bug that will cause irreversible data loss or alteration
   * - an uncontrolled infinite loop that will consume an unbounded amount of resources
   * - a secret key that has been leaked that allows anyone to consume our resources without any bounds
   */
  | "catasrophic"
  /**
   * this is a critical surprise
   *
   * @impact it could result in a loss of large amount of customers, revenue or reputation, and/or create a large amount of work to resolve
   * @action resolve this immediately before anything else
   *
   * examples:
   * - a bug that will cause data loss or alteration that can be recovered but will take a lot of time
   * - a security vulnerability that will let anyone access customer data if they knew how to exploit it
   * - a bug that will cause a large amount of customers to be unable to use the service
   * - a secret key that has been leaked that allows anyone to access our resources, however the effect is either bounded or can be reversed
   */
  | "critical"
  /**
   * this is a dangerous surprise
   *
   * @impact it could result in a major disruption to customers, but either didn't happen yet or happened at a small scale
   * @action resolve this within a day
   */
  | "dangerous"
  /**
   * this is an unexpected surprise
   *
   * @impact this is something that is not expected to happen, and ideally should not happen
   * @action resolve this after your current work
   */
  | "unexpected"
  /**
   * this is a curious surprise
   *
   * @impact we are not sure, this could lead to a problem but probably is fine
   * @action resolve this when you have time and are curious but don't worry about it
   */
  | "curious"
  /**
   * this is an interesting surprise
   *
   * @impact this is something that is interesting but doesn't have any impact
   * @action share this with your team if you think it's interesting
   */
  | "interesting"
  /**
   * this is not really a surprise
   *
   * @impact this is something that is expected to happen and is not a problem
   * @action ignore this unless you are the author of the code
   */
  | "expected"
  /**
   * this is a happy surprise
   *
   * @impact this is something that is good and should be celebrated
   *
   * @action celebrate this
   */
  | "happy"
  /**
   * this is a milestone!
   *
   * @impact this is a milestone that has been reached
   *
   * @action celebrate this
   */
  | "milestone";

const SurpriseKind = Symbol("Surprise");

function t(strings: TemplateStringsArray, ...parts: unknown[]) {
  let message = strings[0];
  for (let i = 0; i < parts.length; i += 1) {
    message += inspect(parts[i], { compact: true }) + strings[i + 1];
  }

  return message;
}

class Base extends Error {
  constructor(ctx: unknown) {
    super(inspect(ctx));
  }
}

const createSurprise = <T>(
  path: string[],
  format: (ctx: T) => string,
  degree: Degree,
  Error: typeof Base,
) =>
  /**
   * https://console.anthropic.com/workbench/7d74b7e6-6a2e-40d7-9180-99716e9fa3ef
   */
  class This extends Error {
    [SurpriseKind] = true;

    path: string[];
    ctx: T;
    degree: Degree;

    constructor(ctx: T, stack?: string) {
      super(ctx);
      this.path = path;
      this.ctx = ctx;
      this.degree = degree;

      if (stack) {
        this.stack = stack;
      }
    }

    serialize() {
      return {
        path: this.path,
        degree: this.degree,
        message: this.message,
        stack: parseStackTrace(this.stack ?? ""),
      };
    }

    format() {
      return printStackTrace(
        `[${this.path.join(" > ")}] ${this.message}`,
        parseStackTrace(this.stack ?? ""),
      );
    }

    render() {
      return this.format();
    }

    toResponse() {
      return new Response(
        // deno-lint-ignore no-control-regex
        this.format().replace(/\u001B\[[0-9;]*m/g, ""),
        { status: 500 },
      );
    }

    static from(err: unknown) {
      if (this.is(err)) {
        return err;
      }

      if (err instanceof Error) {
        return new Unknown(err.message, err.stack);
      }

      const error = this.with`${err}`;

      if ("captureStackTrace" in Error) {
        Error.captureStackTrace(error, this.from);
      }

      return error;
    }

    // throw Surprise.on`template ${literal}`
    static with = (strings: TemplateStringsArray, ...parts: unknown[]) => {
      const message = t(strings, ...parts);
      const error = new Surprise(message);

      if ("captureStackTrace" in Error) {
        Error.captureStackTrace(error, this.with);
      }

      return error;
    };

    static is(err: unknown): err is Surprise {
      return this.match(err) && SurpriseKind in err;
    }

    // check if an error is this type of surprise
    static match(err: unknown): err is Surprise {
      // err might be serialized, so we can't use instanceof
      if (typeof err !== "object" || err === null) {
        return false;
      }

      if ("path" in err && Array.isArray(err.path)) {
        return err.path.join("/##/").startsWith(path.join("/##/")) &&
          "ctx" in err &&
          "degree" in err;
      }

      return false;
    }

    static fromString(err: string): Surprise {
      try {
        const object = JSON.parse(err);

        if (Surprise.match(object)) {
          return new Surprise(object.ctx);
        } else {
          throw null;
        }
      } catch {
        throw new Error("surprisingly not a surprise");
      }
    }

    static extend<U>(
      name: string,
      _format: (ctx: T & U, prev: () => string, _: typeof t) => string = format,
      _degree: Degree = degree,
    ) {
      return createSurprise<T & U>(
        [...path, name],
        (ctx) => _format(ctx, () => format(ctx), t),
        degree,
        // extend this class
        this as unknown as typeof Error,
      );
    }
  };

export const inspect = (_: unknown, options: Deno.InspectOptions = {}) =>
  typeof _ === "string" ? _ : (() => {
    try {
      if (typeof Deno === "undefined") {
        console.log(_);
        return JSON.stringify(_, null, 2);
      }
      return Deno.inspect(_, {
        colors: true,
        compact: false,
        depth: 10,
        ...options,
      });
    } catch {
      return `<uninspectable>`;
    }
  })();

export class Surprise
  extends createSurprise<{}>([], (_) => inspect(_), "unexpected", Base) {}

export class Unknown extends Surprise {}

export const isSurprise = (err: unknown): err is Surprise =>
  typeof err === "object" && err !== null &&
  SurpriseKind in err;
