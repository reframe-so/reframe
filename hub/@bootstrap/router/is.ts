import type React from "npm:react";

export const isPrimitive = (
  value: unknown,
): value is string | number | boolean | null | undefined => {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined;
};

export const isSimpleObject = (
  value: unknown,
): value is Record<string, unknown> => {
  return (
    typeof value === "object" &&
    value !== null &&
    value.constructor === Object
  );
};

export const isReactElement = (value: unknown): value is React.ReactElement => {
  return typeof value === "object" && value !== null && "$$typeof" in value &&
    (
      value.$$typeof === Symbol.for("react.transitional.element") ||
      value.$$typeof === Symbol.for("react.element")
    );
};

export function isReactComponentClass(
  type: unknown,
): type is React.ComponentClass {
  return (
    typeof type === "function" &&
    type.prototype &&
    type.prototype.isReactComponent
  );
}

export const isClientComponent = (
  value: unknown,
): value is React.ComponentType & {
  $$typeof: symbol;
} => {
  return typeof value === "function" &&
    Reflect.get(value, "$$typeof") === Symbol.for("react.client.reference");
};