import * as t from "./t.ts";
import { Reader } from "./interface.ts";
import { minify } from "npm:terser";

/**
 * A reader that compiles modules on read
 */
export const compiler = t.factory(
  class implements Reader {
    #version = 27;
    #minify = true;

    #ctx: t.context.Consumer<{
      head: t.Hash<t.yan.Commit> | null;
      org: string;
      frame: string;
      branch: string;
      workingTree: t.yan.WorkingTree;
    }>;
    #yan: t.yan.Yan;
    #reader: Reader;
    #blob: t.blob.BlobStorage;
    #compiler: t.compiler.Compiler;

    constructor(
      reader: t.Factory<Reader>,
      _: {
        ctx: t.context.Consumer<
          {
            head: t.Hash<t.yan.Commit> | null;
            org: string;
            frame: string;
            branch: string;
            workingTree: t.yan.WorkingTree;
          }
        >;
        yan: t.Factory<t.yan.Yan>;
        blob: t.Factory<t.blob.BlobStorage>;
        compiler: t.Factory<t.compiler.Compiler>;
      },
    ) {
      this.#ctx = _.ctx;
      this.#reader = reader();
      this.#blob = _.blob();
      this.#compiler = _.compiler();
      this.#yan = _.yan();
    }

    async resolve(
      specifier: string,
      attributes: Record<string, string>,
      importer: t.Specifier,
    ): Promise<t.Specifier> {
      if (importer.scheme !== "compile") {
        return this.#reader.resolve(
          specifier,
          attributes,
          importer,
        );
      }

      const inner = t.Specifier.deserialize(
        importer.path as t.SerializedSpecifier,
      );

      const resolved = await this.#reader.resolve(
        specifier,
        attributes,
        inner,
      );

      return new t.Specifier(
        "compile",
        resolved.serialize(),
        importer.attributes,
      );
    }

    async read<T>(specifier: t.Specifier): Promise<t.Blob<T>> {
      if (specifier.scheme !== "compile") {
        // Forward non-compile specifiers directly to the underlying reader
        return this.#reader.read<T>(specifier);
      }

      // Extract the inner specifier from the path
      const inner = t.Specifier.deserialize(
        specifier.path as t.SerializedSpecifier,
      );

      // Read the source content using the inner specifier
      const blob = await this.#reader.read<unknown>(inner);
      const hash = await blob.hash();

      // We need to get the content as text

      // check if specifier.path is already compiled
      const ctx = this.#ctx.use();

      try {
        const content = await ctx.workingTree.read(
          `/~/compile${specifier.path}`,
        ).then((blob) => blob.text());

        const [prevVersion, prevHash, source] = content.split("\n");

        if (prevVersion === this.#version.toString() && prevHash === hash) {
          return new t.Blob(source);
        }
        // if the content is not the same, we need to recompile

        throw new t.yan.NotFoundSurprise({ path: specifier.path });
      } catch (e) {
        if (!(e instanceof t.yan.NotFoundSurprise)) {
          throw e;
        }

        // Compile it
        // console.log("[compile]", specifier.path);
        const source = await this.#compiler.compile(
          inner.path,
          blob.clone(),
          inner.attributes.env,
        );

        // console.log(`====== [src] ${specifier.path} ======`);
        // console.log(await blob.text());
        // replace the content with the compiled content
        if (this.#minify) {
          try {
            const result = await minify(source.content, {
              sourceMap: false,
            });

            console.log(
              inner.path,
              source.content.length,
              result.code!.length,
            );
            source.content = result.code!;
          } catch (err) {
            const anyErr = err as {
              message?: string;
              line?: number;
              col?: number;
            };
            const where =
              (anyErr.line !== undefined && anyErr.col !== undefined)
                ? ` (${anyErr.line}:${anyErr.col})`
                : "";

            let frame = "";
            if (anyErr.line !== undefined && anyErr.col !== undefined) {
              const lines = source.content.split("\n");
              const ln = anyErr.line as number; // Terser reports 1-based
              const start = Math.max(1, ln - 1);
              const end = Math.min(lines.length, ln + 1);
              const pad = String(end).length;
              const pointer = (n: number) =>
                `${String(n).padStart(pad, " ")} | ${lines[n - 1]}`;
              const caret = `${" ".repeat(pad + 3 + (anyErr.col ?? 0))}^`;
              frame = `\n${pointer(start)}\n${pointer(ln)}\n${caret}\n${
                pointer(end)
              }`;
            }

            console.log(">>>>", inner.path);

            throw t.Surprise
              .with`terser minify failed for ${inner.path}${where}: ${
              anyErr.message ?? err
            }${frame}`;
          }
        }

        source.content = await this.#blob.write(
          new t.Blob(
            source.content.replace(
              "export default",
              "return",
            ) + `\n\n//# sourceURL=${specifier.path}`,
          ),
        );

        // source.content = await this.#blob.write(
        //   new t.Blob(t.encodeBase64(source.content)),
        // );

        // if (
        // ) {
        //   console.log("====== [src] =======");
        //   console.log(await blob.text());
        // }

        // console.log("[compiler]", inner.path, content);

        const compiled = JSON.stringify({
          version: this.#version,
          hash,
          ...source,
        });

        // RIGHT: don't re-compile if the file exists
        await ctx.workingTree.write(
          `/~/compile${specifier.path}`,
          new t.Blob(
            [this.#version, hash, compiled].join("\n"),
          ),
        );

        // Serialize as a Source blob and return as Hash<T>
        return new t.Blob(compiled) as t.Blob<T>;
      }
    }
  },
);
