const stats = {} as Record<string, {
  count: number;
  time: number;
}>;

const enabled = () => Reflect.has(self, "__measure");

export function measure<Fn extends (...args: any[]) => any>(
  label: string,
  fn: Fn,
) {
  if (!enabled()) {
    return fn;
  }

  stats[label] ??= { count: 0, time: 0 };
  return ((...args: unknown[]) => {
    const now = performance.now();
    const result = fn(...args);

    stats[label].count++;
    stats[label].time += performance.now() - now;

    return result;
  }) as Fn;
}

measure.enable = () => {
  Reflect.set(self, "__measure", stats);
};

measure.disable = () => {
  Reflect.deleteProperty(self, "__measure");
};

measure.work = <T>(label: string, fn: () => T) => {
  if (!enabled()) {
    return fn();
  }

  stats[label] ??= { count: 0, time: 0 };
  const start = performance.now();
  const result = fn();

  stats[label].count++;
  stats[label].time += performance.now() - start;

  return result;
};

measure.start = (label: string) => {
  if (!enabled()) {
    return () => {};
  }

  stats[label] ??= { count: 0, time: 0 };
  const now = performance.now();
  return () => {
    stats[label].count++;
    stats[label].time += performance.now() - now;
  };
};

measure.summary = () => {
  // create a tree from keys, which are . separated strings
  // and then print the tree in the following format:
  //
  // measured (138ms)
  // ├── superjson (100ms)
  // │   ├── stringify (10ms) (1341x)
  // │   └── deserialize (90ms) (1341x)
  // └── treeKind (100ms)
  //     ├── serialize (10ms) (1341x)
  //     └── deserialize (90ms) (1341x)
  //

  interface TreeNode {
    time: number;
    count: number;
    children: Map<string, TreeNode>;
  }

  // Build tree structure from dot-separated keys
  const root: TreeNode = {
    time: 0,
    count: 0,
    children: new Map(),
  };

  // Populate tree
  for (const [key, stat] of Object.entries(stats)) {
    if (stat.time < 1) {
      continue;
    }

    const parts = key.split(".");
    let current = root;

    // Add time to root
    root.time += stat.time;

    // Navigate/create path in tree
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (!current.children.has(part)) {
        current.children.set(part, {
          time: 0,
          count: 0,
          children: new Map(),
        });
      }

      current = current.children.get(part)!;

      // Only add stats to leaf nodes
      if (i === parts.length - 1) {
        current.time = stat.time;
        current.count = stat.count;
      }
    }
  }

  // Calculate aggregate times for intermediate nodes
  function calculateAggregates(node: TreeNode): number {
    if (node.children.size === 0) {
      return node.time;
    }

    let totalTime = 0;
    for (const child of node.children.values()) {
      totalTime += calculateAggregates(child);
    }

    // Only update if not already set (leaf nodes have their own time)
    if (node.time === 0) {
      node.time = totalTime;
    }

    return node.time;
  }

  calculateAggregates(root);

  // Format time
  function formatTime(ms: number): string {
    if (ms < 1) {
      return `${(ms * 1000).toFixed(0)}μs`;
    }
    return `${ms.toFixed(0)}ms`;
  }

  // Print tree
  function printTree(
    node: TreeNode,
    name: string,
    prefix: string = "",
    isLast: boolean = true,
    isRoot: boolean = false,
  ): string {
    let output = "";

    if (!isRoot) {
      const connector = isLast ? "└── " : "├── ";
      const timeStr = formatTime(node.time);
      const countStr = node.count > 0 ? ` (${node.count}x)` : "";
      output += `${prefix}${connector}${name} (${timeStr})${countStr}\n`;
    }

    const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
    const children = Array.from(node.children.entries());

    children.forEach(([childName, childNode], index) => {
      const isLastChild = index === children.length - 1;
      output += printTree(childNode, childName, childPrefix, isLastChild);
    });

    return output;
  }

  // Generate output
  let output = "";

  if (root.time > 0) {
    output = `measured (${formatTime(root.time)})\n`;
    output += printTree(root, "measured", "", true, true);
  } else {
    output = "No measurements recorded";
  }

  return {
    total: root.time,
    output: output.trimEnd(),
  };
};

measure.span = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const reset = (label: string) => {
    stats[label] = { count: 0, time: 0 };
  };

  for (const key in stats) {
    reset(key);
  }

  const start = performance.now();
  const result = await fn();
  const elapsed = performance.now() - start;

  const summary = measure.summary();

  const lines = [];

  lines.push(`${label} (${elapsed.toFixed(0)}ms)`);
  const unaccounted = elapsed - summary.total;
  const percent = elapsed > 0
    ? ((unaccounted / elapsed) * 100).toFixed(1)
    : "0.0";
  lines.push(`├── unaccounted (${unaccounted.toFixed(0)}ms) [${percent}%]`);
  lines.push(
    ...summary.output.split("\n").map(
      (line, index) => `${index === 0 ? "└──" : "   "} ${line}`,
    ),
  );

  console.log(lines.join("\n"));

  return result;
};
