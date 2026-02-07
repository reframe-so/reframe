import * as t from "./t.ts";
import { Server } from "./interface.ts";
import { measure } from "../00-base/measure.ts";
import { getCookies } from "jsr:@std/http/cookie";

export type IncomingMessage =
  & { id: number }
  & (
    | { type: "ping" }
    | { type: "pong" }
    | {
      type: "request";
      url: string;
      method?: string;
      headers?: Record<string, string>;
      // TODO: support chunked body
      body?: string;
    }
  );

export type OutgoingMessage =
  & { id: number }
  & (
    | { type: "ping" }
    | { type: "pong" }
    | {
      type: "response";
      status: number;
      headers: Record<string, string>;
      // TODO: support chunked body
      body: string | null;
    }
    | {
      type: "surprise";
      surprise: string;
    }
  );

export type HostConfig = {
  org?: string;
  frame?: string;
  branch?: string;
  subdomains?: {
    [key: string]: {
      org?: string;
      frame?: string;
      branch?: string;
    };
  };
};

export type Defaults = {
  org: string;
  frame: string;
  branch: string;
};

/**
 * Parse request URL to extract organization, name, and branch information
 * Format: <org>--<name>--<branch>.[domain]
 * @param request The incoming request
 * @param hosts Map of hostname to host config
 * @param defaults Default org/frame/branch values
 * @returns Object containing org, name, and branch
 */
export function parseRequest(
  request: Request,
  hosts: Map<string, HostConfig>,
  defaults: Defaults,
): { org: string; frame: string; branch: string } {
  const url = new URL(request.url);

  const cookies = getCookies(request.headers);

  const branchOverride = !cookies["x-reframe-branch"]?.trim().length
    ? undefined
    : cookies["x-reframe-branch"];

  // If the hostname matches exactly, check headers
  if (hosts.has(url.hostname)) {
    const hostDefaults = hosts.get(url.hostname);
    const org = hostDefaults?.org ?? defaults.org;
    const frame = hostDefaults?.frame ?? defaults.frame;
    const branch = branchOverride ?? hostDefaults?.branch ?? defaults.branch;
    return { org, frame, branch };
  }

  // let's treat this as a subdomain
  const [subdomain, ...rest] = url.hostname.split(".");
  const hostname = rest.join(".");

  const hostDefaults = hosts.get(hostname);

  if (hostDefaults?.subdomains?.[subdomain]) {
    const subdomainDefaults = hostDefaults.subdomains[subdomain];
    return {
      org: subdomainDefaults.org ?? hostDefaults.org ?? defaults.org,
      frame: subdomainDefaults.frame ?? hostDefaults.frame ?? defaults.frame,
      branch: branchOverride ?? subdomainDefaults.branch ??
        hostDefaults.branch ?? defaults.branch,
    };
  }

  const parts = subdomain.split("--");
  const hasOrgConfig = hostDefaults?.org !== undefined;

  if (parts.length === 1) {
    if (hasOrgConfig) {
      // Org-first mode: subdomain is org, frame defaults to "home"
      return {
        org: parts[0]!,
        frame: hostDefaults?.frame ?? defaults.frame,
        branch: branchOverride ?? hostDefaults?.branch ?? defaults.branch,
      };
    } else {
      // Frame-first mode: subdomain is frame, org defaults to defaults.org
      return {
        org: defaults.org,
        frame: parts[0]!,
        branch: branchOverride ?? hostDefaults?.branch ?? defaults.branch,
      };
    }
  }

  // 2+ parts: always org--frame or org--frame--branch
  const urlBranch = parts.length > 2 ? parts.slice(2).join("--") : undefined;
  return {
    org: parts[0]!,
    frame: parts[1] ?? defaults.frame,
    branch: branchOverride ?? urlBranch ?? hostDefaults?.branch ??
      defaults.branch,
  };
}

type Ctx = {
  org: string;
  frame: string;
  branch: string;
  config: t.Hash<t.Config>;
  runtimeServer: string;
};

export const router = t.factory(
  class implements Server {
    #app: t.Factory<Server>;
    #ctx: t.context.Provider<Ctx>;
    #runtimeServerUrl: string;
    #hosts: Map<string, HostConfig>;
    #defaults: Defaults;

    constructor(
      ctx: t.context.Provider<Ctx>,
      app: t.Factory<Server>,
      runtimeServerUrl: string,
      defaults: Defaults,
    ) {
      this.#app = app;
      this.#ctx = ctx;
      this.#runtimeServerUrl = runtimeServerUrl;
      this.#defaults = defaults;
      this.#hosts = new Map<string, HostConfig>();
      this.#hosts.set("localhost", defaults);
    }

    setRuntimeServerUrl(runtimeServerUrl: string) {
      this.#runtimeServerUrl = runtimeServerUrl;
    }

    async #resolve(request: Request) {
      // Parse the request to get org, name, and branch
      const { org, frame, branch } = parseRequest(
        request,
        this.#hosts,
        this.#defaults,
      );

      // In a real implementation, we would fetch the config from KV using org, name, branch
      // For now, using a dummy config
      const config = "config123" as t.Hash<t.Config>;

      return {
        org,
        frame,
        branch,
        config,
      };
    }

    fetch(request: Request) {
      return measure.work("router.fetch", async () => {
        const app = this.#app();
        const url = new URL(request.url);

        if (url.pathname.startsWith("/~")) {
          return fetch(
            new Request(
              this.#runtimeServerUrl + url.pathname.slice(2) + url.search,
              {
                method: request.method,
                headers: request.headers,
                body: request.body,
              },
            ),
          );
        }

        return this.#resolve(request).then((ctx) =>
          this.#ctx.with(
            { ...ctx, runtimeServer: this.#runtimeServerUrl },
            () => app.fetch(request),
          )
        );
      });
    }
  },
);
