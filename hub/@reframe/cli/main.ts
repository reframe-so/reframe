import { parseArgs } from "jsr:@std/cli/parse-args";
import type { Hash, yan } from "@reframe/aether/xx-stage/t.ts";
import * as serve from "./commands/serve.ts";
import * as org from "./commands/org.ts";
import * as app from "./commands/app.ts";
import * as branch from "./commands/branch.ts";
import * as commit from "./commands/commit.ts";
import * as tree from "./commands/tree.ts";
import * as blob from "./commands/blob.ts";
import * as bootstrap from "./commands/bootstrap.ts";

// ANSI colors
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function printHelp() {
  console.log(`
${CYAN}reframe-cli${RESET} - Command line interface for Reframe

${GREEN}Server Commands:${RESET}
  serve              Start hypervisor (port 8000) and aether (port 8001)
  hypervisor         Start hypervisor only (port 8000)
  aether             Start aether only (port 8001)

${GREEN}Server Options:${RESET}
  --default=@org/app/branch   Set default project
  --esm=<url>                 Set ESM CDN (default: https://esm.sh)

${GREEN}Org Commands:${RESET}
  org list           List all organizations
  org create <slug>  Create new org with default app "home" and branch "master"

${GREEN}App Commands:${RESET}
  app list <org>           List apps in organization
  app create <org> <slug>  Create new app with master branch

${GREEN}Branch Commands:${RESET}
  branch list <org> <app>                      List branches
  branch read <org> <app> <branch>             Get branch head commit
  branch create <org> <app> <name> --from=<branch>
  branch create <org> <app> <name> --commit=<hash>
  branch write <org> <app> <branch> <files.json> <message>

${GREEN}Commit Commands:${RESET}
  commit log <hash> [--limit=N]  Get commit history (default: 20)

${GREEN}Tree Commands:${RESET}
  tree read <hash>  Read file tree at commit

${GREEN}Blob Commands:${RESET}
  blob <hash1> [hash2] ...  Read blobs and output JSON

${GREEN}Bootstrap Commands:${RESET}
  bootstrap              Read hub/@bootstrap/* and write to @bootstrap/*/master

${GREEN}Examples:${RESET}
  deno run -A main.ts serve
  deno run -A main.ts org create myorg
  deno run -A main.ts org list
  deno run -A main.ts app create @myorg myapp
  deno run -A main.ts branch list @myorg myapp
`);
}

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["from", "commit", "limit", "default", "esm"],
    boolean: ["help", "version"],
    alias: { h: "help", v: "version" },
  });

  const [command, subcommand, ...rest] = args._;

  if (args.help || !command) {
    printHelp();
    return;
  }

  // Parse --default flag: @org, @org/frame, or @org/frame/branch
  function parseDefault(value: string | undefined): {
    org: string;
    frame: string;
    branch: string;
  } | undefined {
    if (!value) return undefined;

    // Remove leading @ if present
    const cleaned = value.startsWith("@") ? value.slice(1) : value;
    const parts = cleaned.split("/");

    if (parts.length === 1) {
      return { org: parts[0]!, frame: "home", branch: "master" };
    } else if (parts.length === 2) {
      return { org: parts[0]!, frame: parts[1]!, branch: "master" };
    } else {
      return { org: parts[0]!, frame: parts[1]!, branch: parts[2]! };
    }
  }

  const defaults = parseDefault(args.default);

  // Set ESM CDN from --esm arg
  if (args.esm) {
    Deno.env.set("ESM_CDN", args.esm);
  }

  try {
    switch (command) {
      case "serve":
        if (defaults) {
          console.log(`${DIM}default project: @${defaults.org}/${defaults.frame}/${defaults.branch}${RESET}`);
        }
        console.log(`${DIM}esm cdn: ${Deno.env.get("ESM_CDN") ?? "https://esm.sh"}${RESET}`);
        await serve.serve(defaults);
        break;

      case "hypervisor":
        if (defaults) {
          console.log(`${DIM}default project: @${defaults.org}/${defaults.frame}/${defaults.branch}${RESET}`);
        }
        await serve.hypervisor(defaults);
        break;

      case "aether":
        console.log(`${DIM}esm cdn: ${Deno.env.get("ESM_CDN") ?? "https://esm.sh"}${RESET}`);
        await serve.aether();
        break;

      case "org":
        await handleOrgCommand(subcommand, rest);
        break;

      case "app":
        await handleAppCommand(subcommand, rest);
        break;

      case "branch":
        await handleBranchCommand(subcommand, rest, args);
        break;

      case "commit":
        await handleCommitCommand(subcommand, rest, args);
        break;

      case "tree":
        await handleTreeCommand(subcommand, rest);
        break;

      case "blob":
        await handleBlobCommand(subcommand, rest);
        break;

      case "bootstrap":
        await bootstrap.run();
        break;

      default:
        console.error(`${RED}Unknown command: ${command}${RESET}`);
        printHelp();
        Deno.exit(1);
    }
  } catch (error) {
    console.error(`${RED}Error: ${(error as Error).message}${RESET}`);
    Deno.exit(1);
  }
}

async function handleOrgCommand(
  subcommand: string | number | undefined,
  rest: (string | number)[],
) {
  if (subcommand === "list") {
    const orgs = await org.list();
    if (orgs.length === 0) {
      console.log(`${DIM}(no organizations)${RESET}`);
    } else {
      console.log(orgs.join("\n"));
    }
  } else if (subcommand === "create") {
    const [slug] = rest;
    if (!slug) {
      throw new Error("Usage: org create <slug>");
    }
    const hash = await org.create(String(slug));
    console.log(`${GREEN}Created org ${slug}${RESET}`);
    console.log(`${DIM}Commit: ${hash}${RESET}`);
  } else {
    throw new Error(`Unknown org command: ${subcommand}`);
  }
}

async function handleAppCommand(
  subcommand: string | number | undefined,
  rest: (string | number)[],
) {
  if (subcommand === "list") {
    const [orgSlug] = rest;
    if (!orgSlug) {
      throw new Error("Usage: app list <org>");
    }
    const apps = await app.list(String(orgSlug));
    if (apps.length === 0) {
      console.log(`${DIM}(no apps)${RESET}`);
    } else {
      console.log(apps.join("\n"));
    }
  } else if (subcommand === "create") {
    const [orgSlug, appSlug] = rest;
    if (!orgSlug || !appSlug) {
      throw new Error("Usage: app create <org> <slug>");
    }
    const hash = await app.create(String(orgSlug), String(appSlug));
    console.log(`${GREEN}Created app ${orgSlug}/${appSlug}${RESET}`);
    console.log(`${DIM}Commit: ${hash}${RESET}`);
  } else {
    throw new Error(`Unknown app command: ${subcommand}`);
  }
}

async function handleBranchCommand(
  subcommand: string | number | undefined,
  rest: (string | number)[],
  args: { from?: string; commit?: string },
) {
  if (subcommand === "list") {
    const [orgSlug, appSlug] = rest;
    if (!orgSlug || !appSlug) {
      throw new Error("Usage: branch list <org> <app>");
    }
    const branches = await branch.list(String(orgSlug), String(appSlug));
    if (branches.length === 0) {
      console.log(`${DIM}(no branches)${RESET}`);
    } else {
      for (const [name, hash] of branches) {
        console.log(`${name} ${DIM}${hash}${RESET}`);
      }
    }
  } else if (subcommand === "read") {
    const [orgSlug, appSlug, branchName] = rest;
    if (!orgSlug || !appSlug || !branchName) {
      throw new Error("Usage: branch read <org> <app> <branch>");
    }
    const head = await branch.read(
      String(orgSlug),
      String(appSlug),
      String(branchName),
    );
    console.log(head ?? `${DIM}(no commits)${RESET}`);
  } else if (subcommand === "create") {
    const [orgSlug, appSlug, branchName] = rest;
    if (!orgSlug || !appSlug || !branchName) {
      throw new Error(
        "Usage: branch create <org> <app> <name> --from=<branch>|--commit=<hash>",
      );
    }
    const opts = args.from
      ? { from: args.from }
      : args.commit
        ? { commit: args.commit }
        : null;
    if (!opts) {
      throw new Error("Must specify --from or --commit");
    }
    const hash = await branch.create(
      String(orgSlug),
      String(appSlug),
      String(branchName),
      opts,
    );
    console.log(`${GREEN}Created branch ${branchName}${RESET}`);
    console.log(`${DIM}Commit: ${hash}${RESET}`);
  } else if (subcommand === "write") {
    const [orgSlug, appSlug, branchName, filesJson, ...messageParts] = rest;
    if (!orgSlug || !appSlug || !branchName || !filesJson) {
      throw new Error(
        "Usage: branch write <org> <app> <branch> <files.json> <message>",
      );
    }
    const files = JSON.parse(String(filesJson));
    const message = messageParts.join(" ") || "commit via cli";
    const hash = await branch.write(
      String(orgSlug),
      String(appSlug),
      String(branchName),
      files,
      message,
    );
    console.log(`${GREEN}Wrote to ${branchName}${RESET}`);
    console.log(`${DIM}Commit: ${hash}${RESET}`);
  } else {
    throw new Error(`Unknown branch command: ${subcommand}`);
  }
}

async function handleCommitCommand(
  subcommand: string | number | undefined,
  rest: (string | number)[],
  args: { limit?: string },
) {
  if (subcommand === "log") {
    const [hash] = rest;
    if (!hash) {
      throw new Error("Usage: commit log <hash> [--limit=N]");
    }
    const limit = args.limit ? parseInt(args.limit) : 20;
    const logs = await commit.log(String(hash) as Hash<yan.Commit>, limit);
    for (const entry of logs) {
      const date = entry.timestamp
        ? new Date(entry.timestamp).toISOString()
        : "";
      console.log(
        `${CYAN}${String(entry.hash).slice(0, 8)}${RESET} ${
          entry.message ?? "(no message)"
        } ${DIM}${date}${RESET}`,
      );
    }
  } else {
    throw new Error(`Unknown commit command: ${subcommand}`);
  }
}

async function handleTreeCommand(
  subcommand: string | number | undefined,
  rest: (string | number)[],
) {
  if (subcommand === "read") {
    const [hash] = rest;
    if (!hash) {
      throw new Error("Usage: tree read <hash>");
    }
    const entries = await tree.read(String(hash) as Hash<yan.Commit>);
    for (const [name, node] of Object.entries(entries)) {
      const icon = (node as { kind: string }).kind === "tree" ? "d" : "-";
      console.log(
        `${icon} ${name} ${DIM}${(node as { hash: string }).hash}${RESET}`,
      );
    }
  } else {
    throw new Error(`Unknown tree command: ${subcommand}`);
  }
}

async function handleBlobCommand(
  first: string | number | undefined,
  rest: (string | number)[],
) {
  const hashes = first ? [first, ...rest].map(String) : [];
  if (hashes.length === 0) {
    throw new Error("Usage: blob <hash1> [hash2] ...");
  }
  await blob.read(hashes);
}

if (import.meta.main) {
  await main();
}
