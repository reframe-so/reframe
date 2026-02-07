import { shape } from "./factory.ts";
import { IN, KIND, OUT, Shape, ShapeError } from "../core.ts";

export interface Never<
  reason extends string | undefined = undefined,
  context = undefined,
> extends Shape {
  [KIND]: "never";

  reason: reason;
  context?: context;

  readonly [IN]: never;
  readonly [OUT]: never;
}

export const never = <
  reason extends string | undefined = undefined,
  context = undefined,
>(
  reason: reason = undefined as reason,
  context?: context,
) =>
  shape<Never<reason, context>>(
    {
      [KIND]: "never",
      reason,
      context,
      parse: function* (value, { path }) {
        yield ShapeError.from(path, `[never] ${reason}`, value);

        return [];
      },
    },
  );
