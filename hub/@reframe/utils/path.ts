/**
 * Type definition for path strings
 */
export type Path = `/${string}`;

/**
 * Reduces path segments, handling ".." by removing the previous segment
 * @param segments Path segments to reduce
 * @returns Reduced path segments
 */
const reduceDotDot = (segments: string[]): string[] =>
  segments.reduce((slice, p) => {
    if (
      p === ".." && slice.length > 0 &&
      slice[slice.length - 1] !== ".."
    ) {
      slice.pop();
    } else {
      slice.push(p);
    }
    return slice;
  }, [] as Array<string>);

/**
 * Splits a path into segments, handling both forward and backward slashes
 * @param path The path to split
 * @returns Array of path segments
 */
export function splitPath(path: string): string[] {
  return reduceDotDot(
    path
      .split(/[\/\\]+/g)
      .filter((p) => p !== "" && p !== "."),
  );
}

/**
 * Gets the directory path of a given path
 * @param path The path to get the directory from
 * @returns The directory path
 */
export const dirPath = (path: Path): Path => {
  const parts = splitPath(path);
  parts.pop();
  return cleanPath(parts.join("/"));
};

/**
 * Gets the base name of a path
 * @param path The path to get the base name from
 * @returns The base name of the path
 */

export const fileName = (path: Path): string => {
  const parts = splitPath(path);
  return parts[parts.length - 1];
};

/**
 * Joins a base path with a relative path
 * @param from The base path
 * @param to The relative path to join
 * @returns The joined path
 */
export const joinPath = (from: Path, ...next: string[]): Path => {
  const parts = splitPath(from);
  for (const to of next) {
    for (const part of splitPath(to)) {
      if (part === "..") {
        parts.pop();
      } else {
        parts.push(part);
      }
    }
  }

  return cleanPath(parts.join("/"));
};

/**
 * Cleans a path by normalizing it
 * @param path The path to clean
 * @returns A normalized path
 */
export function cleanPath(path: string): Path {
  return `/${splitPath(path).join("/")}`;
}
