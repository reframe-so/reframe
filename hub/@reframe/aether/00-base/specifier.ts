/**
 * Specifier represents a module path
 */
import type { Path } from "@reframe/utils/path.ts";
import { Surprise } from "@reframe/surprise/index.ts";
import { measure } from "./measure.ts";

export type SerializedSpecifier = `/~${string}/(${string})/${string}`;
export class Specifier {
  scheme: string;
  path: Path;
  attributes: Record<string, string>;

  constructor(
    scheme: string,
    path: Path,
    attributes: Record<string, string>,
  ) {
    this.scheme = scheme;
    this.path = path;
    this.attributes = attributes;

    if (!scheme.match(/^[a-z]+$/)) {
      throw Surprise.with`unexpected scheme: ${scheme}`;
    }

    if (!path.startsWith("/")) {
      throw Surprise.with`unexpected path: ${path}`;
    }
  }

  encode(
    text: string,
    replace: Array<[RegExp, string]>,
  ): string {
    return replace.reduce(
      (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
      encodeURIComponent(text),
    );
  }

  static decode(
    text: string,
    replace: Array<[RegExp, string]>,
  ): string {
    return decodeURIComponent(
      replace.reduce(
        (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
        text,
      ),
    );
  }

  serialize(): SerializedSpecifier {
    return `/~${this.scheme}/(${
      Object.entries(this.attributes).length === 0
        ? "" as const
        : `${
          Object.entries(this.attributes)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) =>
              [key, value].map((s) =>
                this.encode(s, [
                  [/\(/g, "%28"],
                  [/\)/g, "%29"],
                  [/%3A/g, ":"],
                ])
              ).join("=")
            )
            .join(",")
        }` as const
    })/${
      this.encode(
        this.path.slice(1),
        [
          [/%2F/g, "/"],
          [/%40/g, "@"],
          [/%2E/g, "."],
          [/%3D/g, "="],
        ],
      )
    }` as const;
  }

  static deserialize(input: SerializedSpecifier): Specifier {
    return measure.work("Specifier.deserialize", () => {
      if (!input.startsWith("/~")) {
        throw Surprise.with`unexpected input: ${input}`;
      }

      const [scheme, _attributes, ...parts] = input.slice(2).split("/");

      if (!_attributes.startsWith("(") || !_attributes.endsWith(")")) {
        throw Surprise.with`unexpected attributes: ${_attributes}`;
      }

      const path = `/${
        this.decode(
          parts.join("/"),
          [
            [/\//g, "%2F"],
            [/@/g, "%40"],
            [/\./g, "%2E"],
          ],
        )
      }`;
      const attributes = Object.fromEntries(
        _attributes.slice(1, -1).split(",")
          .flatMap((part) => {
            if (part === "") return [];

            const [key, value] = part.split("=");
            return [[
              decodeURIComponent(key),
              decodeURIComponent(value),
            ]];
          }),
      );

      return new Specifier(
        scheme,
        path as Path,
        attributes,
      );
    });
  }
}

export const specifier = (
  input: SerializedSpecifier | {
    scheme: string;
    path: Path;
    attributes: Record<string, string>;
  },
): Specifier => {
  if (typeof input === "string") {
    return Specifier.deserialize(input);
  }

  return new Specifier(input.scheme, input.path, input.attributes);
};
