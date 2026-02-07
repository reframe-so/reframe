import * as t from "@reframe/aether/xx-stage/t.ts";
import { withContext } from "../context.ts";

const SKIP_FILES = ["deno.json", "deno.lock"];

async function readDirRecursive(
  dir: string,
  base: string = "",
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for await (const entry of Deno.readDir(dir)) {
    if (SKIP_FILES.includes(entry.name)) continue;

    const path = `${dir}/${entry.name}`;
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isFile) {
      files[`@/${relativePath}`] = await Deno.readTextFile(path);
    } else if (entry.isDirectory) {
      Object.assign(files, await readDirRecursive(path, relativePath));
    }
  }
  return files;
}

export async function run(): Promise<void> {
  // Ensure data directory exists
  await Deno.mkdir("data", { recursive: true });

  const bootstrapDir = "hub/@bootstrap";

  const frames: string[] = [];
  for await (const entry of Deno.readDir(bootstrapDir)) {
    if (entry.isDirectory) {
      frames.push(entry.name);
    }
  }

  if (frames.length === 0) {
    console.log("No frames found in hub/@bootstrap/");
    return;
  }

  await withContext(async ({ yan, Blob }) => {
    for (const frame of frames) {
      const files = await readDirRecursive(`${bootstrapDir}/${frame}`);
      const fileCount = Object.keys(files).length;

      if (fileCount === 0) {
        console.log(`Skipping ${frame} (no files)`);
        continue;
      }

      const fileBlobs: Record<t.Path, t.Blob<unknown>> = {};
      for (const [p, content] of Object.entries(files)) {
        fileBlobs[p as t.Path] = new Blob(content);
      }

      const commit = await yan().write(null, fileBlobs, "bootstrap");
      await yan().push(["bootstrap", frame, "master"], commit, "replace");

      console.log(`@bootstrap/${frame}/master -> ${commit} (${fileCount} files)`);
    }
  });
}
