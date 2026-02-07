import * as t from "./t.ts";

export const blobs = (files: Record<string, string>) => {
  const result = new Map<t.Path, t.Blob>();
  for (const path in files) {
    result.set(t.cleanPath(path), new t.Blob(files[path]));
  }
  return result;
};

export const files = (path: string) => {
  // read all files in the path
  const list = Deno.readDirSync(import.meta.dirname + "/" + path);
  const files = new Map<t.Path, t.Blob>();
  for (const file of list) {
    const content = Deno.readTextFileSync(
      import.meta.dirname + "/" + path + "/" + file.name,
    );
    files.set(`/@/${file.name}`, new t.Blob(content));
  }

  return files;
};
