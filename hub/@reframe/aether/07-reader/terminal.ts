import * as t from "./t.ts";
import { Reader } from "./interface.ts";

export const terminal = t.factory(
  class implements Reader {
    constructor() {}

    resolve(
      specifier: string,
      attributes: Record<string, string>,
      importer: t.Specifier,
    ): Promise<t.Specifier> {
      throw t.Surprise
        .with`can not resolve ${specifier} (${attributes}) from ${importer}`;
    }

    read<T>(
      specifier: t.Specifier,
    ): Promise<t.Blob<T>> {
      throw t.Surprise
        .with`can not read ${specifier}`;
    }
  },
);
