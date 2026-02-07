import * as t from "./t.ts";

export class Surprise extends t.Surprise.extend("blob") {}

export class NotFoundSurprise extends Surprise.extend<{
  hash: t.Hash<unknown>;
}>(
  "not-found",
  (ctx, _, t) => t`blob not found for ${ctx.hash}`,
) {}

export class MultipleSurprise extends Surprise.extend<{
  hash: t.Hash<unknown>;
}>(
  "multiple",
  (ctx, _, t) => t`multiple blobs found with prefix ${ctx.hash}%`,
) {}

export class EmptyBlobSurprise extends Surprise.extend<{}>(
  "empty-blob",
) {}

export interface BlobStorage {
  write<T>(
    blob: t.Blob<T>,
  ): Promise<t.Hash<T>>;

  read<T>(
    hash: t.Hash<T>,
  ): Promise<t.Blob<T>>;

  readMany<T>(
    hashes: t.Hash<T>[],
  ): Promise<[t.Hash<T>, t.Blob<T>][]>;

  resolve<T>(
    prefix: t.Hash<T>,
  ): Promise<t.Hash<T>>;
}
