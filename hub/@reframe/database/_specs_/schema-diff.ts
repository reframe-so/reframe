import { t } from "../index.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const schema = {
  tables: {} as Record<string, t.Table>,
  next: (tables: Record<string, t.Table>) => {
    const diff = t.diff(
      t.schema(schema.tables),
      t.schema(tables),
      {
        extends: (a, b) => (
          a === "number" && b === "boolean"
        ),
        dropTables: true,
      },
    );
    schema.tables = tables;
    return diff;
  },
};

Deno.test("diff", async ({ step }) => {
  await step("create user and accounts", () => {
    assertEquals(
      schema.next({
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
      }),
      {
        tables: {
          org: {
            create: {
              columns: {
                createdAt: { nullable: false, type: "string" },
                id: { nullable: false, type: "number" },
                name: { nullable: false, type: "string" },
                ownerId: { nullable: false, type: "number" },
                slug: { nullable: false, type: "string" },
              },
              primaryKey: ["id"],
              indices: [
                { columns: ["ownerId"], unique: false },
                { columns: ["slug"], unique: true },
              ],
            },
            type: "create",
          },
          user: {
            create: {
              columns: {
                active: { nullable: true, type: "boolean" },
                createdAt: { nullable: false, type: "string" },
                email: { nullable: false, type: "string" },
                id: { nullable: false, type: "number" },
                metadata: { nullable: false, type: "json" },
                name: { nullable: false, type: "string" },
              },
              indices: [
                { columns: ["createdAt"], unique: false },
                { columns: ["active"], unique: false },
                { columns: ["email"], unique: true },
              ],
              primaryKey: ["id"],
            },
            type: "create",
          },
        },
      },
    );
  });

  await step("drop org and add accounts", () => {
    assertEquals(
      schema.next({
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
      }),
      {
        tables: {
          account: {
            type: "create",
            create: {
              columns: {
                createdAt: { nullable: false, type: "string" },
                id: { nullable: false, type: "number" },
                name: { nullable: false, type: "string" },
                size: { nullable: true, type: "number" },
                slug: { nullable: false, type: "string" },
                userId: { nullable: false, type: "number" },
              },
              indices: [
                { columns: ["userId"], unique: false },
              ],
              primaryKey: ["id"],
            },
          },
          org: { type: "drop" },
        },
      },
    );
  });

  await step("add columns to user and drop columns from account", () => {
    assertEquals(
      schema.next({
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
      }),
      {
        tables: {
          account: {
            type: "alter",
            alter: {
              columns: {
                size: { type: "drop" },
                slug: { type: "drop" },
              },
              indices: [
                { columns: ["createdAt"], type: "create", unique: false },
              ],
            },
          },
          user: {
            alter: {
              columns: {
                age: {
                  type: "create",
                  create: { nullable: false, type: "number" },
                },
                gender: {
                  type: "create",
                  create: { nullable: true, type: "string" },
                },
              },
              indices: [],
            },
            type: "alter",
          },
        },
      },
    );
  });

  await step("add indices to user and drop indices from account", () => {
    assertEquals(
      schema.next({
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
      }),
      {
        tables: {
          account: {
            alter: {
              columns: {},
              indices: [
                { columns: ["createdAt"], type: "drop" },
              ],
            },
            type: "alter",
          },
          user: {
            alter: {
              columns: {},
              indices: [
                { columns: ["age"], type: "create", unique: false },
                { columns: ["gender"], type: "create", unique: false },
              ],
            },
            type: "alter",
          },
        },
      },
    );
  });

  await step("change some indices from non-unique to unique", () => {
    assertEquals(
      schema.next({
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
      }),
      {
        tables: {
          user: {
            alter: {
              columns: {},
              indices: [
                { columns: ["age"], type: "drop" },
                { columns: ["gender"], type: "drop" },
                { columns: ["age"], type: "create", unique: true },
                { columns: ["gender"], type: "create", unique: true },
              ],
            },
            type: "alter",
          },
        },
      },
    );
  });

  await step("change some indices from unique to non-unique", () => {
    assertEquals(
      schema.next({
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
      }),
      {
        tables: {
          user: {
            alter: {
              columns: {},
              indices: [
                { columns: ["email"], type: "drop" },
                { columns: ["age"], type: "drop" },
                { columns: ["gender"], type: "drop" },
                { columns: ["email"], type: "create", unique: false },
                { columns: ["age"], type: "create", unique: false },
                { columns: ["gender"], type: "create", unique: false },
              ],
            },
            type: "alter",
          },
        },
      },
    );
  });

  await step("change some columns from one type to another", () => {
    assertThrows(
      () =>
        schema.next({
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

  await step("change primary key", () => {
    assertThrows(
      () =>
        schema.next({
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
  await step("number > boolean should not show diff", () => {
    assertThrows(
      () =>
        t.diff(
          t.schema({
            user: t.table({ id: t.number() })
              .primary("id"),
          }),
          t.schema({
            user: t.table({ id: t.boolean() })
              .primary("id"),
          }),
          { extends: (a, b) => false },
        ),
    );

    assertEquals(
      t.diff(
        t.schema({
          user: t.table({
            id: t.number(),
            metadata: t.string(),
          })
            .primary("id"),
        }),
        t.schema({
          user: t.table({
            id: t.boolean(),
            metadata: t.json(),
          })
            .primary("id"),
        }),
        {
          extends: (a, b) =>
            (a === "number" && b === "boolean") ||
            (a === "string" && b === "json"),
        },
      ),
      { tables: {} },
    );
  });
});
