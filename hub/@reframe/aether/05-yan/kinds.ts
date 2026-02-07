import * as t from "./t.ts";
import { Commit, Tree } from "./interface.ts";
import { measure } from "../00-base/measure.ts";

JSON.stringify = measure("JSON.stringify", JSON.stringify);
JSON.parse = measure("JSON.parse", JSON.parse);

export const treeKind = t.kind<Tree>({
  async serialize(content, metadata) {
    return new t.Blob(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(content)
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
      metadata,
    );
  },
  async deserialize(content) {
    const text = await content.text();
    return JSON.parse(text) as Tree;
  },
});

export const commitKind = t.kind<Commit>({
  serialize: async (metadata) => new t.Blob(JSON.stringify(metadata)),
  deserialize: async (content) => {
    const text = await content.text();
    return JSON.parse(text) as Commit;
  },
});
