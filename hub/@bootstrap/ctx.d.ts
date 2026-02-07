/**
 * Type definitions for lib:ctx virtual module.
 *
 * At runtime, this is injected by aether. See the full context at:
 * hub/@reframe/aether/10-server/aether.ts (lines 88-101)
 */

import type {
  Blob as BlobClass,
  Hash,
} from "../@reframe/aether/00-base/common.ts";
import type { SerializedSpecifier } from "../@reframe/aether/00-base/specifier.ts";
import type { BlobStorage } from "../@reframe/aether/04-blob/interface.ts";
import type {
  Change3,
  Commit,
  Node,
  Tree,
  Yan,
} from "../@reframe/aether/05-yan/interface.ts";
import type { Server as SyncServer } from "../@reframe/aether/05-1-sync/interface.ts";
import type { BlockSignature } from "../@reframe/aether/08-linker/interface.ts";
import type { Runtime } from "../@reframe/aether/09-evaluator/interface.ts";
import type { Bundler } from "../@reframe/aether/xx-stage/bundle.ts";

export { Path } from "../@reframe/utils/path.ts";

export { Surprise } from "../@reframe/surprise/index.ts";

// export actual types from aether

// Re-export types for convenience
export type { BlockSignature, Change3, Commit, Hash, Node, SerializedSpecifier, Tree };

/** Blob constructor */

export class Blob<T> extends BlobClass<T> {}

/** Blob storage */
export const blob: BlobStorage;

/** Yan instance for branch/tree operations */
export const yan: Yan;

/** Type checking function */
export function typecheck(
  org: string,
  frame: string,
  branch: string,
): Promise<unknown>;

/** Environment variables */
export const env: Record<string, string>;

export const runtimeServer: string;

/** Sync server and serve function */
export const sync: {
  server: SyncServer;
  serve: (server: SyncServer, basePath?: string) => (request: Request) => Promise<Response>;
};

/** Bundler for building client JS */
export const bundler: Bundler;

/** Runtime context for evaluating modules */
export const runtime: {
  use(): Runtime & { serializedGraph: string };
};
