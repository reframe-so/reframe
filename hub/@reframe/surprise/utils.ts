type Tree = [string, Tree[]];

export function printTree(lines: Tree): string {
  // Print a flat sequence of tree nodes with depth-based pointers
  const [header, children] = lines;
  return header + "\n" +
    children
      .map(([label], index) => {
        const isLast = index === children.length - 1;
        const marker = isLast ? "└" : "├";
        const pointer = marker + "──".repeat(index + 1);
        return `${pointer} ${label}`;
      })
      .join("\n");
}

export function printStackTrace(message: string, frames: StackFrame[]): string {
  // Convert frames to tree nodes all under the root
  const children: Tree[] = frames
    .filter((frame) => !frame.file.startsWith("ext:"))
    .map((frame) => {
      let label = "";
      if (frame.async) {
        label += "async ";
      }
      if (frame.function && frame.function !== "anonymous") {
        label +=
          `${frame.function} (${frame.file}:${frame.line}:${frame.column})`;
      } else {
        label += `${frame.file}:${frame.line}:${frame.column}`;
      }
      return [label, []];
    });

  const tree: Tree = [message, children];
  return printTree(tree);
}

interface StackFrame {
  file: string;
  line: number;
  column: number;
  function: string;
  async: boolean;
}

export function parseStackTrace(trace: string): StackFrame[] {
  const lines = trace
    .split("\n").slice(1); // Remove the first line (error message)

  const frames = lines.map((line) => {
    const match = line.match(
      /at\s+(?:(?<async>async)\s+)?(?:(?<func>.+?)\s+\()?(?:(?<file>.+?):(?<line>\d+):(?<col>\d+))\)?/,
    );

    if (!match || !match.groups) return null;

    const { async: isAsync, func, file, line: lineNum, col: colNum } =
      match.groups;

    return {
      file: file.startsWith("data:")
        ? file.split(";")[1].startsWith("base64")
          ? file.split(";")[0] + ";base64,..."
          : file.split(";")[1]
        : file,
      line: parseInt(lineNum, 10),
      column: parseInt(colNum, 10),
      function: func || "anonymous",
      async: Boolean(isAsync),
    } satisfies StackFrame;
  }).filter(Boolean) as StackFrame[];

  return frames;
}
