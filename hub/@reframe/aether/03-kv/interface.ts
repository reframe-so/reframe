import * as t from "./t.ts";

/**
 * Base surprise class for KV-related errors
 */
export class KVSurprise extends t.Surprise.extend<{}>("kv") {}

/**
 * Thrown when a key is not found in the KV store
 */
export class KeyNotFoundSurprise extends KVSurprise.extend<{
  key: string[];
  version?: number;
}>(
  "key-not-found",
  (ctx) =>
    `key not found: ${ctx.key.join("/")}${
      ctx.version ? ` (@${ctx.version})` : ""
    }`,
) {}

export const XVersion = "x-kv-version";

/**
 * Key-Value store interface
 */

export interface KV {
  $sync(): Promise<void> | void;

  set<T>(
    key: string[],
    value: t.Blob<T>,
  ): Promise<t.Blob<T>>;

  get<T>(
    key: string[],
  ): Promise<t.Blob<T>>;

  getMany<T>(keys: string[][]): Promise<[string[], t.Blob<T>][]>;

  list(
    prefix: string[],
    opts?: { limit?: number; after?: string[] },
  ): Promise<[string[], t.Blob<unknown>][]>;
}

export const createKV = (_: KV) => _;
