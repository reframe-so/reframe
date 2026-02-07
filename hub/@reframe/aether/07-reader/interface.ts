import * as t from "./t.ts";

export class ReaderSurprise extends t.Surprise.extend<{}>("reader") {}

export class InvalidSpecifierSurprise extends ReaderSurprise.extend<{
  specifier: string;
  attributes: Record<string, string>;
  importer: t.Specifier;
}>(
  "invalid-specifier",
  (ctx) =>
    `${ctx.specifier} in ${ctx.importer.serialize()} with attributes ${
      JSON.stringify(ctx.attributes)
    }`,
) {}

export class VersionMismatchSurprise extends ReaderSurprise.extend<{
  expected: number;
  actual: number;
}>(
  "version-mismatch",
  (ctx) => `expected version ${ctx.expected} but got ${ctx.actual}`,
) {}

export interface Reader {
  resolve(
    specifier: string,
    attributes: Record<string, string>,
    importer: t.Specifier,
  ): Promise<t.Specifier>;

  read<T>(
    specifier: t.Specifier,
  ): Promise<t.Blob<T>>;
}

export type ReframeJson = {
  dependencies: Record<string, string>;
};
