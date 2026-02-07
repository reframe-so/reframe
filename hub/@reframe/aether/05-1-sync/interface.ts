import * as t from "./t.ts";

// ============================================
// Base Surprise
// ============================================

export class SyncSurprise extends t.Surprise.extend("sync") {}

export class UnimplementedSurprise extends SyncSurprise.extend(
  "unimplemented",
) {}

export class HeadMismatchSurprise extends SyncSurprise.extend<{
  expected: t.Hash<t.yan.Commit> | null;
  actual: t.Hash<t.yan.Commit> | null;
}>(
  "head-mismatch",
  (ctx, _, t) =>
    t`head mismatch: expected ${ctx.expected ?? "null"}, got ${ctx.actual ?? "null"}`,
) {}

// ============================================
// Transfer Types
// ============================================

/**
 * A single item in a transfer stream.
 * Order: blobs first, then trees, then commits (dependency order).
 *
 * All items are sent as raw Uint8Array data to preserve hash integrity.
 * (JSON parse/stringify can change formatting and break hash verification)
 */
export type TransferItem = {
  type: "blob" | "tree" | "commit";
  hash: t.Hash<unknown>;
  data: Uint8Array;
};

// ============================================
// Remote Tracking
// ============================================

/**
 * Tracks all remote refs.
 * Stored atomically at ["yan", "remotes"] in client KV.
 *
 * Structure: { "origin": { "org/frame/branch": <hash> } }
 */
export type Remotes = Record<string, Record<string, t.Hash<t.yan.Commit> | null>>;

// ============================================
// Results
// ============================================

export interface PullResult {
  /** LCA computed by server */
  lca: t.Hash<t.yan.Commit> | null;
  /** Server's head after pull */
  head: t.Hash<t.yan.Commit> | null;
}

export interface PushResult {
  success: boolean;
  head?: t.Hash<t.yan.Commit>;
  error?: "head_mismatch" | "no_commits";
  /** Server's actual head (when mismatch) */
  actualHead?: t.Hash<t.yan.Commit>;
}

// ============================================
// Server Interface
// ============================================

/**
 * Sync server that handles pull/push requests.
 *
 * Usage:
 *   const handler = server.serve("/sync");
 *   // handler processes: GET/POST /sync/<branch>?head=<commit>
 *
 * Or use pull/push directly for testing:
 *   const result = await server.pull(["org", "frame", "main"], clientHead);
 */
export interface Server {
  /**
   * Handle a pull request.
   *
   * Computes lca(head, serverHead) and returns transfer payload
   * from lca+1 to serverHead.
   *
   * @param branch - Branch path
   * @param head - Client's last known head (null for first pull)
   */
  pull(
    branch: string[],
    head?: t.Hash<t.yan.Commit> | null,
  ): Promise<PullResult & { payload: AsyncIterable<TransferItem> }>;

  /**
   * Handle a push request.
   *
   * Checks that head matches server's current head (optimistic lock).
   * If match, stores payload and updates branch.
   *
   * @param branch - Branch path
   * @param head - Expected server head (null for first push)
   * @param payload - Transfer items to store
   */
  push(
    branch: string[],
    head: t.Hash<t.yan.Commit> | null,
    payload: AsyncIterable<TransferItem>,
  ): Promise<PushResult>;
}

/**
 * Creates a request handler from a Server.
 *
 * @param server - Server instance
 * @param basePath - URL prefix (e.g., "/sync" or "/yan")
 * @returns Request handler function
 *
 * Routes:
 *   GET  {basePath}/{branch}?head={commit}  - Pull
 *   POST {basePath}/{branch}?head={commit}  - Push
 *
 * Branch format: "org/frame/name" (no leading @)
 */
export type CreateHandler = (
  server: Server,
  basePath: string,
) => (request: Request) => Promise<Response>;

/**
 * Creates a Server that communicates over HTTP.
 *
 * @param url - Base URL for sync requests (e.g., "https://origin.reframe.so/sync")
 * @returns Server instance that uses fetch
 */
export type CreateRemote = (url: string) => Server;

// ============================================
// Remote Store
// ============================================

/**
 * Storage for remote tracking refs.
 * Provides synchronous read/write for a single Remotes object.
 */
export interface RemoteStore {
  read(): Remotes;
  write(remotes: Remotes): void;
}

// ============================================
// Client Interface
// ============================================

/**
 * Sync client that manages remotes and syncs with servers.
 *
 * Usage:
 *   client.remote.add("origin", "https://origin.reframe.so/sync");
 *   await client.pull("origin", ["org", "frame", "main"]);
 *   await client.push("origin", ["org", "frame", "main"]);
 */
export interface Client {
  /**
   * Remote management.
   */
  remote: {
    /**
     * Add a remote.
     * @param name - Remote name (e.g., "origin")
     * @param server - Server instance for communication
     */
    add(name: string, server: Server): Promise<void>;

    /**
     * Remove a remote.
     */
    remove(name: string): Promise<void>;

    /**
     * List all remotes.
     */
    list(): Promise<Map<string, Server>>;

    /**
     * Get the last known head for a remote branch.
     * @param remote - Remote name (e.g., "origin")
     * @param branch - Branch path
     */
    head(
      remote: string,
      branch: string[],
    ): Promise<t.Hash<t.yan.Commit> | null>;
  };

  /**
   * Pull from remote.
   *
   * Sends GET {remoteUrl}/{branch}?head={lastKnownHead}
   * Receives transfer payload and stores objects.
   * Updates remote head to server's head.
   *
   * @param remote - Remote name (e.g., "origin")
   * @param branch - Branch path (e.g., ["org", "frame", "main"])
   */
  pull(remote: string, branch: string[]): Promise<PullResult>;

  /**
   * Push to remote.
   *
   * Computes lca(localHead, remote.head(remote, branch))
   * Sends POST {remoteUrl}/{branch}?head={remoteHead} with transfer payload
   * On success, updates remote head to new head.
   *
   * @param remote - Remote name
   * @param branch - Branch path
   */
  push(remote: string, branch: string[]): Promise<PushResult>;

  /**
   * Full sync: pull, rebase local changes if needed, push.
   *
   * 1. Pull latest from remote
   * 2. If local has diverged, compute diff(remoteHead, localHead)
   * 3. Apply diff on top of remoteHead -> rebased commit
   * 4. Push rebased commit
   *
   * @param remote - Remote name
   * @param branch - Branch path
   * @param message - Commit message for rebased commit
   */
  sync(
    remote: string,
    branch: string[],
    message?: string,
  ): Promise<{ pulled: PullResult; pushed: PushResult | null; rebased: boolean }>;
}

// ============================================
// Transfer Functions (will be in transfer.ts)
// ============================================

/**
 * Creates transfer payload for commits from base to head.
 *
 * Algorithm:
 * 1. Walk commits from head back to base (exclusive)
 * 2. Reverse to process oldest-first (dependency order)
 * 3. For each commit, yield new trees/blobs not in previous tree
 * 4. Yield commit
 */
export interface Transfer {
  /**
   * Create transfer payload as async generator.
   */
  createPayload(
    head: t.Hash<t.yan.Commit>,
    base: t.Hash<t.yan.Commit> | null,
  ): AsyncGenerator<TransferItem>;

  /**
   * Receive transfer payload and store to blob storage.
   * Returns the final commit hash.
   */
  receivePayload(
    items: AsyncIterable<TransferItem>,
  ): Promise<t.Hash<t.yan.Commit> | null>;
}
