```tsx
import { t } from "@reframe/database/index.ts";

const schema = t.schema({
  users: t
    .table({
      id: t.number(),
      name: t.string(),
      email: t.string(),
      createdAt: t.date(),
      metadata: t.json(),
    })
    .primary("id")
    .unique("email"),

  org: t
    .table({
      id: t.number(),
      name: t.string(),
      slug: t.string(),
      ownerId: t.number(),
      createdAt: t.date(),
      metadata: t.json(),
    })
    .primary("id")
    .unique("slug")
    .index("ownerId"),
});

const db = t.server(schema, {
  adapter: t.sqlite({ url: "..." }),
});

// create
// await db.$schema.diff();
await db.users.create({
  id: 1,
  name: "Alice",
  email: "alice@reframe.so",
  createdAt: new Date(),
  metadata: { age: 30 },
});

await db.org.create({
  id: 1,
  name: "Reframe",
  slug: "reframe",
  ownerId: 1,
  createdAt: new Date(),
  metadata: { type: "tech" },
});

// read
const user = await db.users.read({
  email: { $like: "%@reframe.so" },
});

const org = await db.org.read({
  ownerId: 1,
});

// update
await db.users.update(
  { createdAt: { $gt: new Date("2021-01-01") } },
  { metadata: { age: 31 } },
);

// delete
await db.users.delete({ id: 1 });
```
