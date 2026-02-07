import { join } from "jsr:@std/path";
import { parseArgs } from "jsr:@std/cli/parse-args";

interface GitRepo {
  url: string;
  path: string;
  name: string;
}

interface ReleaseOptions {
  commitMessage: string;
  squash?: number;
  dev?: boolean;
}

const ORIGIN_REPO: GitRepo = {
  url: "git@github.com:Corei13/reframe.git",
  path: ".release/origin",
  name: "origin",
};

const MIRROR_REPO: GitRepo = {
  url: "git@github.com:reframe-so/reframe.git",
  path: ".release/mirror",
  name: "mirror",
};

async function runGitCommand(cwd: string, args: string[]): Promise<string> {
  const command = new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();
  const output = new TextDecoder().decode(stdout);
  const error = new TextDecoder().decode(stderr);

  if (code !== 0) {
    throw new Error(`Git command failed: ${error}`);
  }

  return output;
}

async function ensureRepo(repo: GitRepo): Promise<void> {
  console.log(`Checking repository: ${repo.name}...`);

  try {
    await Deno.stat(repo.path);

    // Verify it's a valid git repo
    const gitPath = join(repo.path, ".git");
    await Deno.stat(gitPath);

    console.log(`  ✓ Repository ${repo.name} already exists`);
  } catch {
    // Repository doesn't exist, clone it
    console.log(`  Cloning ${repo.name} from ${repo.url}...`);

    // Ensure parent directory exists
    await Deno.mkdir(".release", { recursive: true });

    const command = new Deno.Command("git", {
      args: ["clone", repo.url, repo.path],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stderr } = await command.output();

    if (code !== 0) {
      const error = new TextDecoder().decode(stderr);
      throw new Error(`Failed to clone ${repo.name}: ${error}`);
    }

    console.log(`  ✓ Cloned ${repo.name} successfully`);
  }
}

async function updateToBranch(repoPath: string, branch: string): Promise<void> {
  console.log(`  Updating to ${branch} branch...`);

  // Check if the branch exists
  try {
    const branches = await runGitCommand(repoPath, ["branch", "-a"]);

    if (branches.trim() === "") {
      // Repository is empty, no branches yet
      console.log(`  ℹ Repository is empty, will create ${branch} branch on first push`);
      return;
    }

    // Check if branch exists locally or remotely
    const branchExists = branches.includes(`${branch}`) || branches.includes(`origin/${branch}`);

    if (!branchExists) {
      console.log(`  ℹ Branch ${branch} doesn't exist yet, will be created on first push`);
      return;
    }

    // Checkout the branch
    await runGitCommand(repoPath, ["checkout", branch]);

    // Pull latest changes
    await runGitCommand(repoPath, ["pull", "origin", branch]);

    console.log(`  ✓ Updated to latest ${branch}`);
  } catch (error) {
    // If checkout fails, the branch might not exist yet
    console.log(`  ℹ Could not update ${branch}, will be created on first push`);
  }
}

async function verifyCleanTree(repoPath: string, repoName: string): Promise<void> {
  console.log(`  Verifying clean git tree...`);

  const status = await runGitCommand(repoPath, ["status", "--porcelain"]);

  if (status.trim() !== "") {
    throw new Error(`Repository has uncommitted changes: ${repoPath}\n${status}`);
  }

  console.log(`  ✓ Git tree is clean`);
}

async function squashCommits(repoPath: string, count: number): Promise<void> {
  console.log(`  Squashing last ${count} commits...`);

  // Soft reset to HEAD~N
  await runGitCommand(repoPath, ["reset", "--soft", `HEAD~${count}`]);

  // Create new commit
  await runGitCommand(repoPath, ["commit", "-m", `Squashed ${count} commits`]);

  console.log(`  ✓ Squashed ${count} commits`);
}

async function deleteAllFiles(repoPath: string): Promise<void> {
  console.log(`  Deleting files from mirror...`);

  let deletedCount = 0;

  for await (const entry of Deno.readDir(repoPath)) {
    if (entry.name === ".git") {
      continue;
    }

    const fullPath = join(repoPath, entry.name);
    await Deno.remove(fullPath, { recursive: true });
    deletedCount++;
  }

  console.log(`  ✓ Deleted ${deletedCount} items`);
}

async function copyFiles(sourcePath: string, targetPath: string): Promise<void> {
  console.log(`  Copying files from origin to mirror...`);

  let copiedCount = 0;

  async function copyRecursive(src: string, dest: string) {
    for await (const entry of Deno.readDir(src)) {
      if (entry.name === ".git") {
        continue;
      }

      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory) {
        await Deno.mkdir(destPath, { recursive: true });
        await copyRecursive(srcPath, destPath);
      } else {
        await Deno.copyFile(srcPath, destPath);
        copiedCount++;
      }
    }
  }

  await copyRecursive(sourcePath, targetPath);

  console.log(`  ✓ Copied ${copiedCount} files`);
}

async function commitAndPush(
  repoPath: string,
  message: string,
  branch: string,
  force: boolean
): Promise<void> {
  console.log(`  Committing changes...`);

  // Stage all changes
  await runGitCommand(repoPath, ["add", "-A"]);

  // Check if there are changes to commit
  const status = await runGitCommand(repoPath, ["status", "--porcelain"]);

  if (status.trim() === "") {
    console.log(`  ℹ No changes to commit`);
    return;
  }

  // Check if we're on a branch, if not create it
  try {
    await runGitCommand(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch {
    // No branch yet, create it
    await runGitCommand(repoPath, ["checkout", "-b", branch]);
  }

  // Commit
  await runGitCommand(repoPath, ["commit", "-m", message]);
  console.log(`  ✓ Committed changes`);

  // Push
  console.log(`  Pushing to ${branch}...`);
  const pushArgs = force
    ? ["push", "--force", "-u", "origin", branch]
    : ["push", "-u", "origin", branch];

  await runGitCommand(repoPath, pushArgs);

  console.log(`  ✓ Pushed to ${branch}${force ? " (force)" : ""}`);
}

async function ensureDevelopBranch(repoPath: string): Promise<void> {
  console.log(`  Ensuring develop branch exists...`);

  try {
    // Try to checkout develop
    await runGitCommand(repoPath, ["checkout", "develop"]);
    console.log(`  ✓ Develop branch exists`);
  } catch {
    // Develop doesn't exist, create it from master
    console.log(`  Creating develop branch from master...`);
    await runGitCommand(repoPath, ["checkout", "-b", "develop", "master"]);
    console.log(`  ✓ Created develop branch`);
  }
}

export async function release(options: ReleaseOptions): Promise<void> {
  console.log("\n🚀 Starting release process...\n");

  const { commitMessage, squash, dev } = options;
  const targetBranch = dev ? "develop" : "master";
  const forcePush = !!squash || !!dev;

  try {
    // Step 1: Ensure both repositories exist
    console.log("Step 1: Ensuring repositories...");
    await ensureRepo(ORIGIN_REPO);
    await ensureRepo(MIRROR_REPO);
    console.log();

    // Step 2: Update origin to master branch
    console.log("Step 2: Updating origin repository...");
    await updateToBranch(ORIGIN_REPO.path, "master");
    await verifyCleanTree(ORIGIN_REPO.path, "origin");
    console.log();

    // Step 3: Update mirror to target branch
    console.log(`Step 3: Updating mirror repository to ${targetBranch}...`);
    if (dev) {
      await ensureDevelopBranch(MIRROR_REPO.path);
    } else {
      await updateToBranch(MIRROR_REPO.path, targetBranch);
    }
    await verifyCleanTree(MIRROR_REPO.path, "mirror");
    console.log();

    // Step 3.5: Squash commits if requested
    if (squash) {
      console.log(`Step 3.5: Squashing commits in mirror...`);
      await squashCommits(MIRROR_REPO.path, squash);
      console.log();
    }

    // Step 4: Delete all files from mirror (except .git)
    console.log("Step 4: Cleaning mirror repository...");
    await deleteAllFiles(MIRROR_REPO.path);
    console.log();

    // Step 5: Copy files from origin to mirror
    console.log("Step 5: Copying files...");
    await copyFiles(ORIGIN_REPO.path, MIRROR_REPO.path);
    console.log();

    // Step 6: Commit and push
    console.log("Step 6: Committing and pushing...");
    await commitAndPush(MIRROR_REPO.path, commitMessage, targetBranch, forcePush);
    console.log();

    console.log("✅ Release completed successfully!\n");

  } catch (error) {
    console.error("\n❌ Release failed:");
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ["squash"],
    boolean: ["dev"],
  });

  const [command, ...rest] = args._;

  if (command === "release") {
    const message = rest[0] ? String(rest[0]) : "";

    if (!message) {
      console.error("Error: commit message required");
      console.error("\nUsage:");
      console.error('  deno task dev release "commit message" [--squash=N] [--dev]');
      console.error("\nOptions:");
      console.error("  --squash=N  Squash last N commits before sync");
      console.error("  --dev       Push to develop branch (force push)");
      Deno.exit(1);
    }

    await release({
      commitMessage: message,
      squash: args.squash ? parseInt(args.squash) : undefined,
      dev: args.dev || false,
    });
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("\nAvailable commands:");
    console.error("  release - Sync origin to mirror repository");
    Deno.exit(1);
  }
}
