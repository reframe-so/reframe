import { withContext } from "../context.ts";
import type { Hash } from "@reframe/aether/xx-stage/t.ts";

export async function read(hashes: string[]): Promise<void> {
  return withContext(async ({ blob }) => {
    const result = await blob().readMany(hashes as Hash<unknown>[]);
    const output = await Promise.all(
      result.map(async ([hash, b]) => [
        hash,
        {
          content: await b.text(),
          metadata: b.metadata,
        },
      ]),
    );
    console.log(JSON.stringify(output));
  });
}
