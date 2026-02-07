import { Blob } from "../t.ts";
import { compiler } from "../ts.mock.ts";
import { format } from "npm:prettier";

const fmt = async (code: string) => {
  return await format(code, {
    parser: "typescript",
    semi: false,
    singleQuote: true,
  });
};

async function print() {
  console.log("\n".repeat(100));
  console.clear();

  const file = await Deno.readTextFile(
    import.meta.dirname! + "/source.tsx",
  );
  // const file = await fetch(
  //   "https://esm-136.fly.dev/*typescript@5.8.3/es2022/typescript",
  // ).then((r) => r.text());

  console.log("================ [source] ==================");
  // console.log(file);

  // compile the file
  const server = await compiler.compile(
    "/source.tsx",
    new Blob(file),
    "server",
  );
  Reflect.deleteProperty(server, "content");
  console.log("================ [server] ==================");
  console.log(server);
  console.log("----------------");
  // console.log(await fmt(serverContent));

  console.log("================ [client] ==================");
  const client = await compiler.compile(
    "/source.tsx",
    new Blob(file),
    "client",
  );
  const clientContent = client.content.split("//# sourceMappingURL=")[0];
  Reflect.deleteProperty(client, "content");
  console.log(client);
  console.log("----------------");
  console.log(await fmt(clientContent));
}

const watcher = Deno.watchFs(
  import.meta.dirname! + "/source.tsx",
  { recursive: false },
);

await print();
for await (const _ of watcher) {
  await print();
}
