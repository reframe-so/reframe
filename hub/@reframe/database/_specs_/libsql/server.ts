import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { t } from "../../index.ts";
import { t as s } from "@reframe/shapes/main.ts";
import { libsql } from "../../adapter/libsql.ts";

const adapter = libsql({ url: "http://127.0.0.1:8080" });

const schema = {
  tables: {} as Record<string, t.Table>,
  async testWith(
    opts: { dropTables?: boolean },
    tables: Record<string, t.Table>,
  ) {
    const _schema = t.schema(tables);
    const db = t.server(_schema, { adapter });
    await db.$schema.sync(opts);
    const diff = await db.$schema.diff();
    assertEquals(diff, { tables: {} });

    schema.tables = tables;
  },
};

Deno.test("diff", async ({ step }) => {
  await step("create user and accounts", async () => {
    await schema.testWith({ dropTables: true }, {
      user: t
        .table({
          id: t.number(),
          name: t.string(),
          email: t.string(),
          active: t.union([t.boolean(), t.null()]),
          createdAt: t.date(),
          metadata: t.json(),
        })
        .primary("id")
        .unique("email")
        .index("createdAt")
        .index("active"),

      org: t
        .table({
          id: t.number(),
          slug: t.string(),
          ownerId: t.number(),
          name: t.string(),
          createdAt: t.date(),
        })
        .primary("id")
        .unique("slug")
        .index("ownerId"),
    });
  });

  await step("drop org and add accounts", async () => {
    await schema.testWith({ dropTables: true }, {
      user: schema.tables.user,
      account: t
        .table({
          id: t.number(),
          userId: t.number(),
          name: t.string(),
          createdAt: t.date(),
          slug: t.string(),
          size: t.nullable(t.number()),
        })
        .primary("id")
        .index("userId"),
    });
  });

  await step("add columns to user and drop columns from account", async () => {
    await schema.testWith({ dropTables: true }, {
      user: t
        .table({
          id: t.number(),
          name: t.string(),
          email: t.string(),
          active: t.union([t.boolean(), t.null()]),
          createdAt: t.date(),
          metadata: t.json(),
          age: t.number(),
          gender: t.union([t.string(), t.null()]),
        })
        .primary("id")
        .unique("email")
        .index("createdAt")
        .index("active"),

      account: t
        .table({
          id: t.number(),
          userId: t.number(),
          name: t.string(),
          createdAt: t.date(),
        })
        .primary("id")
        .index("userId")
        .index("createdAt"),
    });
  });

  await step("add indices to user and drop indices from account", async () => {
    await schema.testWith({ dropTables: true }, {
      user: t
        .table({
          id: t.number(),
          name: t.string(),
          email: t.string(),
          active: t.union([t.boolean(), t.null()]),
          createdAt: t.date(),
          metadata: t.json(),
          age: t.number(),
          gender: t.union([t.string(), t.null()]),
        })
        .primary("id")
        .unique("email")
        .index("createdAt")
        .index("active")
        .index("age")
        .index("gender"),

      account: t
        .table({
          id: t.number(),
          userId: t.number(),
          name: t.string(),
          createdAt: t.date(),
        })
        .primary("id")
        .index("userId"),
    });
  });

  await step("change some indices from non-unique to unique", async () => {
    await schema.testWith({ dropTables: true }, {
      user: t
        .table({
          id: t.number(),
          name: t.string(),
          email: t.string(),
          active: t.union([t.boolean(), t.null()]),
          createdAt: t.date(),
          metadata: t.json(),
          age: t.number(),
          gender: t.union([t.string(), t.null()]),
        })
        .primary("id")
        .unique("email")
        .unique("age")
        .unique("gender")
        .index("createdAt")
        .index("active"),

      account: t
        .table({
          id: t.number(),
          userId: t.number(),
          name: t.string(),
          createdAt: t.date(),
        })
        .primary("id")
        .index("userId"),
    });
  });

  await step("change some indices from unique to non-unique", async () => {
    await schema.testWith({ dropTables: true }, {
      user: t
        .table({
          id: t.number(),
          name: t.string(),
          email: t.string(),
          active: t.union([t.boolean(), t.null()]),
          createdAt: t.date(),
          metadata: t.json(),
          age: t.number(),
          gender: t.union([t.string(), t.null()]),
        })
        .primary("id")
        .index("email")
        .index("age")
        .index("gender")
        .index("createdAt")
        .index("active"),

      account: t
        .table({
          id: t.number(),
          userId: t.number(),
          name: t.string(),
          createdAt: t.date(),
        })
        .primary("id")
        .index("userId"),
    });
  });

  await step("change some columns from one type to another", async () => {
    await assertRejects(
      () =>
        schema.testWith({ dropTables: true }, {
          user: t
            .table({
              id: t.number(),
              name: t.union([t.string(), t.null()]),
              email: t.union([t.string(), t.null()]),
              active: t.boolean(),
              createdAt: t.string(),
              metadata: t.string(),
              age: t.string(),
              gender: t.number(),
            })
            .primary("id")
            .index("email")
            .index("age")
            .index("gender")
            .index("createdAt")
            .index("active"),

          account: t
            .table({
              id: t.number(),
              userId: t.number(),
              name: t.string(),
              createdAt: t.date(),
            })
            .primary("id")
            .index("userId"),
        }),
      Error,
      "user.name nullable changed from false to true",
    );
  });

  await step("change primary key", async () => {
    await assertRejects(
      () =>
        schema.testWith({ dropTables: true }, {
          user: t
            .table({
              id: t.number(),
              name: t.string(),
              email: t.string(),
              active: t.union([t.boolean(), t.null()]),
              createdAt: t.string(),
              metadata: t.json(),
              age: t.number(),
              gender: t.union([t.string(), t.null()]),
            })
            .primary("email")
            .index("id")
            .index("age")
            .index("gender")
            .index("createdAt")
            .index("active"),

          account: t
            .table({
              id: t.number(),
              userId: t.number(),
              name: t.string(),
              createdAt: t.date(),
            })
            .primary("id")
            .index("userId"),
        }),
      Error,
      "user.primaryKey changed from id to email",
    );
  });
});

Deno.test("column type changes", async ({ step }) => {
  await step("number > boolean should not show diff", async () => {
    await schema.testWith({ dropTables: true }, {
      user: t
        .table({
          id: t.number(),
          metadata: t.string(),
        })
        .primary("id"),
    });

    const diff = await t.server(
      t.schema({
        user: t.table({
          id: t.boolean(),
          metadata: t.json(),
        })
          .primary("id"),
      }),
      { adapter },
    ).$schema.diff();

    assertEquals(diff, { tables: {} });
  });
});

Deno.test("crud", async ({ step }) => {
  const timestamp = () =>
    t.column(
      "number",
      s.transformer(
        s.decoder(
          s.number(),
          (value) => new Date(value),
        ),
        s.encoder(
          s.instanceOf(Date),
          (value) => value.getTime(),
        ),
      ),
    );

  const schema = t.schema({
    user: t
      .table({
        id: t.number(),
        name: t.string(),
        email: t.string(),
        active: t.union([t.boolean(), t.null()]),
        createdAt: timestamp(),
        metadata: t.json(),
        signature: t.blob(),
      })
      .primary("id"),

    org: t
      .table({
        id: t.number(),
        slug: t.string(),
        ownerId: t.number(),
        name: t.string(),
        createdAt: timestamp(),
      })
      .primary("id"),

    membership: t
      .table({
        userId: t.number(),
        orgId: t.number(),
        role: t.union([t.literal("admin"), t.literal("member")]),
      })
      .primary("userId", "orgId"),
  });

  const db = t.server(schema, { adapter });

  await db.$schema.sync();

  const users: t.Row<typeof schema.tables.user>[] = [{
    id: 1,
    name: "alice",
    email: "alice@reframe.so",
    active: null,
    createdAt: new Date("2025-01-01"),
    metadata: { age: 30 },
    signature: new Uint8Array([1, 2, 3]),
  }, {
    id: 2,
    name: "bob",
    email: "bob@reframe.so",
    active: true,
    createdAt: new Date("2025-01-02"),
    metadata: { age: 40 },
    signature: new Uint8Array([4, 5, 6]),
  }, {
    id: 3,
    name: "charlie",
    email: "charlie@outside.com",
    active: false,
    createdAt: new Date("2025-01-03"),
    metadata: { age: 50 },
    signature: new Uint8Array([7, 8, 9]),
  }];

  const orgs: t.Row<typeof schema.tables.org>[] = [{
    id: 1,
    slug: "reframe",
    ownerId: 1,
    name: "re:frame",
    createdAt: new Date(),
  }, {
    id: 2,
    slug: "deno",
    ownerId: 2,
    name: "deno, inc.",
    createdAt: new Date(),
  }];

  const memberships: t.Row<typeof schema.tables.membership>[] = [{
    userId: users[1].id,
    orgId: orgs[1].id,
    role: "member",
  }, {
    userId: users[2].id,
    orgId: orgs[1].id,
    role: "admin",
  }, {
    userId: users[0].id,
    orgId: orgs[1].id,
    role: "member",
  }];

  await step("create with valid data", async () => {
    assertEquals(users[0], await db.user.create(users[0]));
    assertEquals(users[1], await db.user.create(users[1]));
    assertEquals(users[2], await db.user.create(users[2]));

    assertEquals(orgs[0], await db.org.create(orgs[0]));
    assertEquals(orgs[1], await db.org.create(orgs[1]));

    assertEquals(memberships[0], await db.membership.create(memberships[0]));
    assertEquals(memberships[1], await db.membership.create(memberships[1]));
    assertEquals(memberships[2], await db.membership.create(memberships[2]));
  });

  await step("create with invalid data", async () => {
    await assertRejects(
      () =>
        db.user.create({
          id: 1,
          name: "alice",
          email: 10 as unknown as string,
          active: null,
          createdAt: new Date(),
          metadata: { age: 30 },
          signature: new Uint8Array([1, 2, 3]),
        }),
      Error,
      "[$.email] expected a string, received: 10",
    );
  });

  await step("create duplicate", async () => {
    await assertRejects(
      () => db.user.create(users[0]),
      Error,
      "UNIQUE constraint failed: user.id",
    );
  });

  await step("read", async () => {
    assertEquals(
      await db.user.read({ where: { id: 1 } }),
      [users[0]],
    );
    assertEquals(
      await db.user.read({ where: { id: 2 } }),
      [users[1]],
    );

    assertEquals(
      await db.user.read({}),
      users,
    );

    assertEquals(
      await db.user.read({ where: { id: 4 } }),
      [],
    );

    assertEquals(
      await db.user.read({ where: { active: false } }),
      [users[2]],
    );

    assertEquals(
      await db.user.read({ where: { createdAt: users[0].createdAt } }),
      [users[0]],
    );

    assertEquals(
      await db.user.read({ where: { metadata: users[1].metadata } }),
      [users[1]],
    );

    assertEquals(
      await db.user.read({ where: { signature: users[2].signature } }),
      [users[2]],
    );

    assertEquals(
      await db.user.read({
        where: { email: { $like: "%@reframe.so" } },
        order: { id: "desc" },
      }),
      [users[1], users[0]],
    );

    assertEquals(
      await db.user.read({
        order: { id: "desc" },
        limit: 2,
      }),
      [users[2], users[1]],
    );

    assertEquals(
      await db.user.read({
        order: { id: "desc" },
        limit: 1,
        offset: 2,
      }),
      [users[0]],
    );
  });

  await step("update", async () => {
    users[0].name = "alice2";
    assertEquals(
      await db.user.update({ where: { id: 1 }, set: { name: "alice2" } }),
      [users[0]],
    );

    // update multiple
    users[0].active = false;
    users[1].active = false;
    assertEquals(
      await db.user.update({
        where: { email: { $like: "%@reframe.so" } },
        set: { active: false },
      }).then((users) => users.sort((a, b) => a.id - b.id)),
      [users[0], users[1]],
    );

    // update none
    assertEquals(
      await db.user.update({ where: { id: 4 }, set: { name: "alice3" } }),
      [],
    );

    // update by date
    users[0].name = "alice4";
    assertEquals(
      await db.user.update({
        where: { createdAt: users[0].createdAt },
        set: { name: "alice4" },
      }),
      [users[0]],
    );

    // update [1] by metadata
    users[1].createdAt = new Date("2025-01-04");
    assertEquals(
      await db.user.update({
        where: { metadata: users[1].metadata },
        set: { createdAt: users[1].createdAt },
      }),
      [users[1]],
    );

    // update [2] by signature
    users[2].name = "charlie2";

    assertEquals(
      await db.user.update({
        where: { signature: users[2].signature },
        set: { name: "charlie2" },
      }),
      [users[2]],
    );
  });

  await step("delete", async () => {
    assertEquals(
      await db.user.delete({ where: { id: 1 } }),
      [users[0]],
    );

    assertEquals(
      await db.user.read({}),
      [users[1], users[2]],
    );

    assertEquals(
      await db.user.delete({ where: { createdAt: users[1].createdAt } }),
      [users[1]],
    );

    assertEquals(
      await db.user.read({}),
      [users[2]],
    );

    assertEquals(
      await db.user.delete({ where: { id: 4 } }),
      [],
    );

    assertEquals(
      await db.user.delete({ where: { signature: users[2].signature } }),
      [users[2]],
    );

    assertEquals(
      await db.user.read({}),
      [],
    );

    // insert users again

    await db.user.create(users[0]);
    await db.user.create(users[1]);
    await db.user.create(users[2]);

    assertEquals(
      await db.user.read({}),
      users,
    );

    // delete multiple
    assertEquals(
      await db.user.delete({
        where: { email: { $like: "%@reframe.so" } },
      }),
      [users[0], users[1]],
    );

    assertEquals(
      await db.user.read({}),
      [users[2]],
    );

    users.splice(0, 2);
  });
});
