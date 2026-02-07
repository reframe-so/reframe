import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { t } from "../../index.ts";
import { libsql } from "../../adapter/libsql.ts";

const adapter = libsql({ url: "http://127.0.0.1:8080" });

Deno.test("schema", async ({ step }) => {
  const diff = (a: t.Schema, b: t.Schema) =>
    t.diff(a, b, { extends: adapter.columnExtends });

  await step("read schema", async () => {
    const schema = await adapter.readSchema();

    assertEquals(diff(schema, t.schema({})), {
      tables: {},
    });
  });

  await step("create user table", async () => {
    await adapter.batch((tx) =>
      tx.createTable("user", {
        columns: {
          id: { type: "number", nullable: false },
          name: { type: "string", nullable: false },
          email: { type: "string", nullable: false },
          active: { type: "boolean", nullable: true },
          createdAt: { type: "string", nullable: false },
        },
        primaryKey: ["id"],
        indices: [
          { columns: ["email"], unique: true },
          { columns: ["createdAt"], unique: false },
          { columns: ["active"], unique: false },
        ],
      })
    );

    const schema = await adapter.readSchema();

    assertEquals(
      diff(
        schema,
        t.schema({
          user: t
            .table({
              id: t.number(),
              name: t.string(),
              email: t.string(),
              active: t.union([t.boolean(), t.null()]),
              createdAt: t.string(),
            })
            .primary("id")
            .unique("email")
            .index("createdAt")
            .index("active"),
        }),
      ),
      { tables: {} },
    );
  });

  await step("try to create user table again", async () => {
    await assertRejects(
      async () =>
        adapter.batch((tx) =>
          tx.createTable("user", {
            columns: { id: { type: "number", nullable: false } },
            primaryKey: ["id"],
            indices: [],
          })
        ),
      Error,
      "table \`user\` already exists",
    );
  });

  await step("try create org table with no columns", async () => {
    await assertRejects(
      async () =>
        adapter.batch((tx) =>
          tx.createTable("org", {
            columns: {},
            primaryKey: [],
            indices: [],
          })
        ),
      Error,
      "table org must have at least one column",
    );
  });

  await step("try create org table with no primary key", async () => {
    await assertRejects(
      async () =>
        adapter.batch((tx) =>
          tx.createTable("org", {
            columns: { id: { type: "number", nullable: false } },
            primaryKey: [],
            indices: [],
          })
        ),
      Error,
      "table org must have a primary key",
    );
  });

  await step("try create org table with non-existent primary key", async () => {
    await assertRejects(
      async () =>
        adapter.batch((tx) =>
          tx.createTable("org", {
            columns: { id: { type: "number", nullable: false } },
            primaryKey: ["nonexistent"],
            indices: [],
          })
        ),
      Error,
      "no such column: nonexistent",
    );
  });

  await step("try create org table with non-existent index", async () => {
    await assertRejects(
      async () =>
        adapter.batch((tx) =>
          tx.createTable("org", {
            columns: { id: { type: "number", nullable: false } },
            primaryKey: ["id"],
            indices: [{ columns: ["nonexistent"], unique: false }],
          })
        ),
      Error,
      "no such column: nonexistent",
    );
  });

  await step("create org table", async () => {
    await adapter.batch((tx) =>
      tx.createTable("org", {
        columns: {
          id: { type: "number", nullable: false },
          tenantId: { type: "number", nullable: false },
        },
        primaryKey: ["tenantId", "id"],
        indices: [],
      })
    );

    const schema = await adapter.readSchema();

    assertEquals(
      diff(
        schema,
        t.schema({
          user: t
            .table({
              id: t.number(),
              name: t.string(),
              email: t.string(),
              active: t.union([t.boolean(), t.null()]),
              createdAt: t.string(),
            })
            .primary("id")
            .unique("email")
            .index("createdAt")
            .index("active"),

          org: t
            .table({
              tenantId: t.number(),
              id: t.number(),
            })
            .primary("tenantId", "id"),
        }),
      ),
      { tables: {} },
    );
  });

  await step("add more columns to org table", async () => {
    await adapter.batch((tx) =>
      tx.createColumn("org", "slug", {
        type: "string",
        nullable: false,
      })
    );

    await adapter.batch((tx) =>
      tx.createColumn("org", "ownerId", {
        type: "number",
        nullable: false,
      })
    );

    await adapter.batch((tx) =>
      tx.createColumn("org", "name", {
        type: "string",
        nullable: false,
      })
    );

    await adapter.batch((tx) =>
      tx.createColumn("org", "createdAt", {
        type: "string",
        nullable: false,
      })
    );

    const schema = await adapter.readSchema();

    assertEquals(
      diff(
        schema,
        t.schema({
          user: t
            .table({
              id: t.number(),
              name: t.string(),
              email: t.string(),
              active: t.union([t.boolean(), t.null()]),
              createdAt: t.string(),
            })
            .primary("id")
            .unique("email")
            .index("createdAt")
            .index("active"),

          org: t
            .table({
              tenantId: t.number(),
              id: t.number(),
              slug: t.string(),
              ownerId: t.number(),
              name: t.string(),
              createdAt: t.string(),
            })
            .primary("tenantId", "id"),
        }),
      ),
      { tables: {} },
    );
  });

  await step("add missing indices to org table", async () => {
    await adapter.batch((tx) => tx.createIndex("org", ["slug"], true));

    await adapter.batch((tx) => tx.createIndex("org", ["ownerId"], false));

    await adapter.batch((tx) =>
      tx.createIndex("org", ["ownerId", "slug"], false)
    );
    const schema = await adapter.readSchema();

    assertEquals(
      diff(
        schema,
        t.schema({
          user: t
            .table({
              id: t.number(),
              name: t.string(),
              email: t.string(),
              active: t.union([t.boolean(), t.null()]),
              createdAt: t.string(),
            })
            .primary("id")
            .unique("email")
            .index("createdAt")
            .index("active"),

          org: t
            .table({
              tenantId: t.number(),
              id: t.number(),
              slug: t.string(),
              ownerId: t.number(),
              name: t.string(),
              createdAt: t.string(),
            })
            .primary("tenantId", "id")
            .unique("slug")
            .index("ownerId")
            .index("ownerId", "slug"),
        }),
      ),
      { tables: {} },
    );
  });

  await step("drop slug column from org table", async () => {
    await adapter.batch((tx) => tx.dropColumn("org", "slug"));

    await adapter.batch((tx) => tx.dropColumn("user", "active"));

    const schema = await adapter.readSchema();

    assertEquals(
      diff(
        schema,
        t.schema({
          user: t
            .table({
              id: t.number(),
              name: t.string(),
              email: t.string(),
              createdAt: t.string(),
            })
            .primary("id")
            .unique("email")
            .index("createdAt"),

          org: t
            .table({
              id: t.number(),
              tenantId: t.number(),
              ownerId: t.number(),
              name: t.string(),
              createdAt: t.string(),
            })
            .primary("tenantId", "id")
            .index("ownerId"),
        }),
      ),
      { tables: {} },
    );
  });

  await step("drop tenantId column from org table", async () => {
    await assertRejects(
      async () => adapter.batch((tx) => tx.dropColumn("org", "tenantId")),
      Error,
      "cannot drop primary key column tenantId from org",
    );
  });

  await step("drop (tenantId, id) index from org table", async () => {
    const before = await adapter.readSchema();
    await adapter.batch((tx) => tx.dropIndex("org", ["tenantId", "id"]));
    const after = await adapter.readSchema();

    assertEquals(diff(before, after), { tables: {} });
  });

  await step("drop org table", async () => {
    await adapter.batch((tx) => tx.dropTable("org"));

    const schema = await adapter.readSchema();

    assertEquals(
      diff(
        schema,
        t.schema({
          user: t
            .table({
              id: t.number(),
              name: t.string(),
              email: t.string(),
              createdAt: t.string(),
            })
            .primary("id")
            .unique("email")
            .index("createdAt"),
        }),
      ),
      { tables: {} },
    );
  });

  await step("drop user table", async () => {
    await adapter.batch((tx) => tx.dropTable("user"));

    const schema = await adapter.readSchema();

    assertEquals(diff(schema, t.schema({})), { tables: {} });
  });
});

Deno.test("crud", async ({ step }) => {
  await adapter.batch((tx) =>
    tx.createTable("test", {
      columns: {
        number: { type: "number", nullable: false },
        string: { type: "string", nullable: false },
        date: { type: "string", nullable: true },
        boolean: { type: "boolean", nullable: true },
        json: { type: "json", nullable: true },
        blob: { type: "blob", nullable: true },
      },
      primaryKey: ["number"],
      indices: [],
    })
  );

  const data = [{
    number: 1,
    string: "one two three",
    date: new Date().toISOString(),
    boolean: 1,
    json: JSON.stringify({ key: "value" }),
    blob: new Uint8Array([1, 2, 3]),
  }, {
    number: 2,
    string: "four five six",
    date: new Date().toISOString(),
    boolean: 0,
    json: JSON.stringify({ key: "value" }),
    blob: new Uint8Array([1, 2, 3]),
  }, {
    number: 3,
    string: "seven eight nine",
    date: null,
    boolean: null,
    json: null,
    blob: null,
  }];

  await step("create with valid data", async () => {
    const test = await adapter.create("test", data.slice(0, 2));

    assertEquals(test, data.slice(0, 2));
  });

  await step("create with duplicate data", async () => {
    await assertRejects(
      async () =>
        adapter.create("test", [{
          number: 1,
          string: "string",
          date: new Date().toISOString(),
          boolean: 1,
          json: JSON.stringify({ key: "value" }),
          blob: new Uint8Array([1, 2, 3]),
        }, {
          number: 1,
          string: "string",
          date: new Date().toISOString(),
          boolean: 1,
          json: JSON.stringify({ key: "value" }),
          blob: new Uint8Array([1, 2, 3]),
        }]),
      Error,
      "UNIQUE constraint failed: test.number",
    );
  });

  await step("create with missing required columns", async () => {
    await assertRejects(
      () =>
        Promise.resolve(adapter.create("test", [{
          number: 3,
          date: new Date().toISOString(),
          boolean: 1,
        }])),
      Error,
      "NOT NULL constraint failed: test.string",
    );
  });

  await step("create with null values", async () => {
    const test = await adapter.create("test", data.slice(2, 3));

    assertEquals(test, data.slice(2, 3));
  });

  await step("create with required null values", async () => {
    await assertRejects(
      () =>
        Promise.resolve(adapter.create("test", [{
          number: 3,
          string: null,
          date: null,
          boolean: null,
          json: null,
          blob: null,
        }])),
      Error,
      "NOT NULL constraint failed: test.string",
    );
  });

  // read

  await step("read all", async () => {
    const test = await adapter.read("test", {});

    assertEquals(test.length, 3);

    assertEquals(test, data);
  });

  await step("read with where", async () => {
    const test1 = await adapter.read("test", {
      where: {
        number: 2,
      },
    });

    assertEquals(test1, [data[1]]);

    const test2 = await adapter.read("test", {
      where: {
        number: { "$gt": 1 },
      },
    });

    assertEquals(test2, [data[1], data[2]]);

    const test3 = await adapter.read("test", {
      where: {
        string: { "$like": "%four%" },
      },
    });

    assertEquals(test3, [data[1]]);

    const test4 = await adapter.read("test", {
      where: {
        json: { "$isNot": null },
      },
    });

    assertEquals(test4, [data[0], data[1]]);

    const test5 = await adapter.read("test", {
      where: {
        number: { "$in": [1, 3] },
      },
    });

    assertEquals(test5, [data[0], data[2]]);
  });

  await step("read with order", async () => {
    const test = await adapter.read("test", {
      order: {
        number: "desc",
      },
    });

    assertEquals(test, data.slice().reverse());
  });

  await step("read with limit and offset", async () => {
    const test = await adapter.read("test", {
      limit: 2,
    });

    assertEquals(test, data.slice(0, 2));

    const test2 = await adapter.read("test", {
      limit: 2,
      offset: 1,
    });

    assertEquals(test2, data.slice(1, 3));

    const test3 = await adapter.read("test", {
      limit: 2,
      offset: 2,
    });

    assertEquals(test3, data.slice(2, 3));

    const test4 = await adapter.read("test", {
      limit: 2,
      offset: 3,
    });

    assertEquals(test4, []);
  });

  await step("read with invalid column", async () => {
    await assertRejects(
      () =>
        Promise.resolve(adapter.read("test", {
          where: {
            nonexistent: 1,
          },
        })),
      Error,
      "no such column: nonexistent",
    );
  });

  // update

  await step("update with valid data", async () => {
    const test = await adapter.update("test", {
      where: {
        number: 1,
      },
      set: {
        string: "updated",
        date: new Date("2021-01-01").toISOString(),
        boolean: 0,
      },
    });

    assertEquals(test, [{
      ...data[0],
      string: "updated",
      date: new Date("2021-01-01").toISOString(),
      boolean: 0,
    }]);
  });

  await step("update with no fields", async () => {
    await assertRejects(
      () =>
        Promise.resolve(adapter.update("test", {
          where: {
            number: 1,
          },
          set: {},
        })),
      Error,
      "must set at least one column",
    );
  });

  await step("update violates constraits", async () => {
    await assertRejects(
      () =>
        Promise.resolve(adapter.update("test", {
          where: {
            number: 1,
          },
          set: {
            number: 2,
          },
        })),
      Error,
      "UNIQUE constraint failed: test.number",
    );
  });

  await step("update with invalid column", async () => {
    await assertRejects(
      () =>
        Promise.resolve(adapter.update("test", {
          where: {
            number: 1,
          },
          set: {
            nonexistent: 1,
          },
        })),
      Error,
      "no such column: nonexistent",
    );
  });

  await step("update many with valid data", async () => {
    const test = await adapter.update("test", {
      where: {
        number: { "$gt": 1 },
      },
      set: {
        string: "updated",
        date: new Date("2021-01-01").toISOString(),
        boolean: 0,
        blob: new Uint8Array([10, 20, 30]),
      },
    });

    assertEquals(test, [{
      ...data[1],
      string: "updated",
      date: new Date("2021-01-01").toISOString(),
      boolean: 0,
      blob: new Uint8Array([10, 20, 30]),
    }, {
      ...data[2],
      string: "updated",
      date: new Date("2021-01-01").toISOString(),
      boolean: 0,
      blob: new Uint8Array([10, 20, 30]),
    }]);
  });

  // delete
  await step("delete with where", async () => {
    const deleted = await adapter.delete("test", {
      where: {
        number: 1,
      },
    });

    const test = await adapter.read("test", {});

    assertEquals(test.map((t) => t.number), [2, 3]);

    assertEquals(deleted, [{
      ...data[0],
      string: "updated",
      date: new Date("2021-01-01").toISOString(),
      boolean: 0,
    }]);
  });

  await step("delete with invalid column", async () => {
    await assertRejects(
      () =>
        Promise.resolve(adapter.delete("test", {
          where: {
            nonexistent: 1,
          },
        })),
      Error,
      "no such column: nonexistent",
    );
  });

  await step("delete many", async () => {
    const newRows = [
      {
        number: 4,
        string: "four",
        date: new Date().toISOString(),
        boolean: 1,
        json: JSON.stringify({ key: "value" }),
        blob: new Uint8Array([1, 2, 3]),
      },
      {
        number: 5,
        string: "five",
        date: new Date().toISOString(),
        boolean: 0,
        json: JSON.stringify({ key: "value" }),
        blob: new Uint8Array([1, 2, 3]),
      },
    ];
    await adapter.create("test", newRows);

    const deleted = await adapter.delete("test", {
      where: {
        number: { "$gt": 3 },
      },
    });

    const test = await adapter.read("test", {});

    assertEquals(test.map((t) => t.number), [2, 3]);

    assertEquals(deleted, newRows.sort((a, b) => a.number - b.number));
  });

  await step("create, read and update empty values", async () => {
    await adapter.batch((tx) =>
      tx.createTable("another", {
        columns: {
          number: { type: "number", nullable: false },
          string: { type: "string", nullable: false },
          boolean: { type: "boolean", nullable: false },
          json: { type: "json", nullable: false },
          blob: { type: "blob", nullable: false },
        },
        primaryKey: ["number"],
        indices: [],
      })
    );

    await adapter.create("another", [{
      number: 0,
      string: "",
      boolean: 0,
      json: JSON.stringify(null),
      blob: new Uint8Array([]),
    }]);

    // read

    const test = await adapter.read("another", {});
    assertEquals(test.length, 1);
    assertEquals(test[0], {
      number: 0,
      string: "",
      boolean: 0,
      json: JSON.stringify(null),
      blob: new Uint8Array([]),
    });

    // update
    const updated = await adapter.update("another", {
      where: {
        number: 0,
      },
      set: {
        number: 1,
        string: "updated",
        boolean: 1,
        json: JSON.stringify({ key: "value" }),
        blob: new Uint8Array([1, 2, 3]),
      },
    });

    assertEquals(updated, [{
      number: 1,
      string: "updated",
      boolean: 1,
      json: JSON.stringify({ key: "value" }),
      blob: new Uint8Array([1, 2, 3]),
    }]);

    // change back
    await adapter.update("another", {
      where: {
        number: 1,
      },
      set: {
        number: 0,
        string: "",
        boolean: 0,
        json: JSON.stringify(null),
        blob: new Uint8Array([]),
      },
    });
    const test2 = await adapter.read("another", {});
    assertEquals(test2.length, 1);
    assertEquals(test2[0], test[0]);
  });
});
