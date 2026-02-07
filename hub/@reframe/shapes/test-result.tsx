import { t } from "./main.ts";

try {
  const tree = (value: unknown) => {
    const print = (value: unknown, prefix: string) => {
      if (typeof value === "object" && value !== null) {
        const keys = Object.keys(value)
          .filter((key) => typeof Reflect.get(value, key) !== "function");

        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const next = Reflect.get(value, key);

          const last = i === keys.length - 1;

          console.log(prefix + (last ? "└─ " : "├─ ") + key);
          print(next, prefix + (last ? "   " : "│  "));
        }
      } else {
        console.log(prefix + "└── " + JSON.stringify(value));
      }
    };

    print(value, "");
  };

  const debug = <T extends t.Shape>(
    shape: T,
    values: unknown[],
  ) => {
    console.log("==================================");
    tree(shape);

    for (const value of values) {
      console.log("----------------------------------");
      const r = shape.parse(value, { action: "read", refs: {}, path: "$" });

      while (true) {
        const { value, done } = r.next();
        if (value instanceof Error) {
          console.log({ error: value.print() });
          console.log("          --------------");
        } else if (value.length > 0) {
          console.log(value);
        }

        if (done) {
          break;
        }
      }
    }
    console.log("==================================");

    console.log("\n\n\n");
  };

  debug(
    t.array(t.number()),
    [
      [1, 2, 3],
      [1, 2, "3"],
      ["1", 2, 3, "4", 5, 6, "7"],
    ],
  );

  debug(
    t.union([
      t.number(),
      t.array(t.number()),
      t.array(t.array(t.number())),
    ]),
    [
      1,
      [1, 2, 3],
      [[1, 2, 3]],
      [[1]],
      [["0"]],
    ],
  );

  debug(
    t.object({
      a: t.string(),
      b: t.number(),
      c: t.array(
        t.record(
          t.union([
            t.literal("alice"),
            t.literal("bob"),
          ]),
          t.tuple([
            t.union([
              t.literal("foo"),
              t.literal("bar"),
            ]),
            t.literal(42),
          ]),
        ),
      ),
    }),
    [
      { a: "a", b: 1, c: [1, 2, 3] },
      { a: "a", b: 1, c: [1, 2, "3"] },
      { a: "a", b: 1, c: [1, 2, 3], d: 4 },
      {
        a: "",
        b: 10,
        c: [{
          "alice": ["foo", 42],
          "bob": ["bar", 42],
          "charlie": ["baz", 42],
        }],
      },
    ],
  );

  const binaryDecoder = t.decoder(
    t.union([
      t.literal(0),
      t.literal(1),
    ]).nullable(),
    (value) => value === 0 ? false : value === 1 ? true : "foo",
  );

  const binaryEncoder = t.encoder(
    t.union([t.boolean(), t.literal("foo")]),
    (value) => value ? 1 : value === false ? 0 : null,
  );

  const binary = t.transformer(binaryDecoder, binaryEncoder);

  const date = () =>
    t.transformer(
      t.decoder(
        t.string(),
        (value) => new Date(value),
      ),
      t.encoder(
        t.instanceOf(Date),
        (value) => value.toISOString(),
      ),
    );

  const timestamp = () =>
    t.transformer(
      t.decoder(
        t.instanceOf(Date),
        (value) => value.getTime(),
      ),
      t.encoder(
        t.number(),
        (value) => new Date(value),
      ),
    );

  debug(
    t.object({
      a: binary,
      b: date(),
      c: t.tuple([binary, binary, binary]),
      d: t.object({
        date: date(),
        timestamp: timestamp(),
      }),
    }),
    [
      {
        a: 0,
        b: "2021-01-01T00:00:00.000Z",
        c: [0, 1, null],
        d: {
          date: "2021-02-01T00:00:00.000Z",
          timestamp: new Date(),
        },
      },
      {
        a: 1,
        b: "2021-02-01T00:00:00.000Z",
        c: [0, 1, 0],
        d: {
          date: "2021-03-01T00:00:00.000Z",
          timestamp: new Date("2021-04-01T00:00:00.000Z"),
        },
      },
    ],
  );
} catch (error) {
  console.error(error);
}
