import * as simpleKv from "@reframe/aether/03-kv/simple.ts";
import * as t from "@reframe/aether/xx-stage/t.ts";

const SEPARATOR = "#";

const decodeKey = (key: string) => {
  if (
    !key.endsWith(SEPARATOR) ||
    !key.startsWith(SEPARATOR)
  ) {
    throw t.Surprise.with`key ${key} does not end with separator ${SEPARATOR}`;
  }

  if (key === SEPARATOR) {
    return [];
  }

  return key.slice(1, -1)
    .split(SEPARATOR)
    .map((part) => t.decodeBase58(part));
};

console.log("Starting KV migration...");

const db = t.db.server(simpleKv.schema, {
  adapter: t.db.sqlite({ url: "file:./data/truth.db" })(),
});

await db.kv.update({
  where: {},
  set: { version: -1 },
});

let totalMigrated = 0;
let batchNumber = 0;

while (true) {
  batchNumber++;
  const rows = await db.kv.read({
    where: {
      version: -1,
    },
    limit: 1000,
  });

  if (rows.length === 0) {
    break;
  }

  console.log(`Processing batch ${batchNumber}: ${rows.length} rows`);

  for (const row of rows) {
    const decodedKey = decodeKey(row.key);
    const newKey = simpleKv.encodeKey(decodedKey);

    await db.kv.update({
      where: { key: row.key },
      set: {
        key: newKey,
        version: 1,
      },
    });

    totalMigrated++;
  }

  console.log(`Progress: ${totalMigrated} keys migrated`);
}

console.log(`Migration complete: ${totalMigrated} total keys migrated`);
