import * as t from "./t.ts";
import { Reader } from "./interface.ts";
import { createApp } from "../yy-specs/create.tsx";

export const yan = t.factory(
  class implements Reader {
    #next: Reader;
    #ctx: t.context.Consumer<
      { head: t.Hash<t.yan.Commit> | null; workingTree: t.yan.WorkingTree }
    >;

    constructor(
      next: t.Factory<Reader>,
      _: {
        ctx: t.context.Consumer<
          { head: t.Hash<t.yan.Commit> | null; workingTree: t.yan.WorkingTree }
        >;
      },
    ) {
      this.#next = next();
      this.#ctx = _.ctx;
    }

    async resolve(
      specifier: string,
      attributes: Record<string, string>,
      importer: t.Specifier,
    ): Promise<t.Specifier> {
      if (importer.scheme !== "yan") {
        return this.#next.resolve(specifier, attributes, importer);
      }

      if (specifier.startsWith("/")) {
        return new t.Specifier(
          importer.scheme,
          specifier as t.Path,
          { ...importer.attributes, ...attributes },
        );
      }

      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        return new t.Specifier(
          importer.scheme,
          t.joinPath(t.dirPath(importer.path), specifier),
          { ...importer.attributes, ...attributes },
        );
      }

      if (specifier.startsWith("@/")) {
        return new t.Specifier(
          importer.scheme,
          t.cleanPath(specifier),
          { ...importer.attributes, ...attributes },
        );
      }

      if (specifier.startsWith("@")) {
        return this.#next.resolve(specifier, attributes, importer);
      }

      if (specifier.startsWith("npm:")) {
        return this.#next.resolve(specifier, attributes, importer);
      }

      if (specifier.startsWith("lib:")) {
        return new t.Specifier(
          "lib",
          `/${specifier.slice(4)}`,
          { ...importer.attributes, ...attributes },
        );
      }

      if (specifier.startsWith("node:")) {
        return new t.Specifier(
          "node",
          `/${specifier.slice(5)}`,
          { ...importer.attributes, ...attributes },
        );
      }

      throw t.Surprise.with`invalid specifier: ${specifier}`;
    }

    async read<T>(specifier: t.Specifier): Promise<t.Blob<T>> {
      if (specifier.scheme !== "yan") {
        return this.#next.read<T>(specifier);
      }

      const ctx = this.#ctx.use();
      const head = ctx.head;

      if (head === null) {
        throw t.Surprise
          .with`missing head commit in context: ${ctx}`;
      }

      try {
        return await ctx.workingTree.read<unknown>(specifier.path) as t.Blob<T>;
      } catch (e) {
        if (
          e instanceof t.yan.NotFoundSurprise &&
          specifier.path === "/~entry.ts"
        ) {
          return new t.Blob(`
            export { default } from "@/app.tsx" with { env: "server" };
            export { createClient } from "@bootstrap/render/web.tsx" with { env: "client" };
          `);
        }
        if (
          e instanceof t.yan.NotFoundSurprise &&
          specifier.path === "/@/app.tsx"
        ) {
          const appFile = await createApp(ctx.workingTree);

          return new t.Blob<T>(appFile);
        }
        if (e instanceof t.yan.NotFoundSurprise) {
          throw t.Surprise.with`not found: ${specifier.path}`;
        }

        throw e;
      }
    }
  },
);
