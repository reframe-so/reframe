import * as db from "./index.ts";

// Clean up any existing test database
try {
  await Deno.remove("/tmp/blob.db");
} catch {
  // Ignore if file doesn't exist
}

export const sqlite = db.sqlite({ url: "file:/tmp/blob.db" });
