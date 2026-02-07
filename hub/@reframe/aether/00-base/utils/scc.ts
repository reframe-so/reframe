export class SCC<T extends string | number> {
  #graph = new Map<T, [T, string][]>();
  #reversedGraph = new Map<T, T[]>();
  #colorMap = new Map<T, number>();
  #orderMap = new Map<T, number>();
  // smaller colour means above in the topological order

  has(a: T): boolean {
    return this.#graph.has(a);
  }

  addEdge(a: T, b: T, label: string) {
    this.addNode(a);
    this.addNode(b);

    if (a === b) {
      return;
    }

    this.#graph.get(a)!.push([b, label]);
    this.#reversedGraph.get(b)!.push(a);
  }

  addNode(a: T) {
    this.#graph.set(a, this.#graph.get(a) ?? []);
    this.#reversedGraph.set(a, this.#reversedGraph.get(a) ?? []);
  }

  getNodes(): T[] {
    return Array.from(this.#graph.keys());
  }

  getEdges(a: T): [T, string][] {
    return this.#graph.get(a) ?? [];
  }

  build(): void {
    // First DFS to build finish time order
    const visitMap = new Map<T, number>();
    const finishOrder: T[] = [];

    const dfs1 = (node: T) => {
      if (visitMap.has(node)) return;
      visitMap.set(node, visitMap.size);

      const neighbors = this.#graph.get(node) ?? [];
      for (const [neighbor] of neighbors) {
        dfs1(neighbor);
      }

      finishOrder.push(node);
    };

    // Run first DFS on all nodes
    for (const node of this.#graph.keys()) {
      dfs1(node);
    }

    // Second DFS to identify SCCs
    const visited = new Set<T>();
    const sccMap = new Map<T, number>(); // Maps node to SCC ID

    const dfs2 = (node: T, sccId: number) => {
      if (visited.has(node)) return;
      visited.add(node);
      sccMap.set(node, sccId);

      const neighbors = this.#reversedGraph.get(node) ?? [];

      for (const neighbor of neighbors) {
        dfs2(neighbor, sccId);
      }
    };

    // Process nodes in reverse finish order

    let sccId = 0;
    finishOrder.reverse();

    for (const node of finishOrder) {
      if (!visited.has(node)) {
        dfs2(node, sccId);
        sccId++;
      }
    }

    // Build the condensation graph (graph of SCCs)
    const condensationGraph = Array(sccId).fill(0).map(() => [] as number[]);
    const inDegree = Array(sccId).fill(0).map(() => new Set<number>());

    for (
      const [node, id] of Array.from(sccMap.entries())
    ) {
      const neighbors = this.#graph.get(node) ?? [];
      for (const [neighbor] of neighbors) {
        const neighborId = sccMap.get(neighbor)!;
        if (id !== neighborId) {
          condensationGraph[id].push(neighborId);
          inDegree[neighborId].add(id);
        }
      }
    }

    const topoOrder = new Map<number, number>();

    const first = new Map<number, T>();

    const dfs3 = (scc: number) => {
      if (topoOrder.has(scc)) return;
      topoOrder.set(scc, topoOrder.size);

      for (const neighbor of condensationGraph[scc]) {
        inDegree[neighbor].delete(scc);
      }

      dfs4(first.get(scc)!, scc);
    };

    const dfs4 = (node: T, scc: number) => {
      if (this.#orderMap.has(node)) return;
      this.#orderMap.set(node, this.#orderMap.size);

      for (const [neighbor] of this.#graph.get(node) ?? []) {
        const theirScc = sccMap.get(neighbor)!;
        if (theirScc === scc) {
          dfs4(neighbor, scc);
        } else {
          if (!first.has(theirScc)) {
            first.set(theirScc, neighbor);
          }
          if (inDegree[theirScc].size === 0) {
            dfs3(theirScc);
          }
        }
      }
    };

    for (const node of this.#graph.keys()) {
      const scc = sccMap.get(node)!;
      if (inDegree[scc].size === 0 && !first.has(scc)) {
        first.set(scc, node);
        dfs3(scc);
      }
    }

    for (const node of this.#graph.keys()) {
      this.#colorMap.set(node, topoOrder.get(sccMap.get(node)!)!);
    }
  }

  component(a: T): number {
    if (!this.#colorMap.has(a)) {
      throw new Error("SCC not built yet");
    }
    return this.#colorMap.get(a)!;
  }

  condense(): Map<number, {
    nodes: T[];
    edges: number[];
  }> {
    const condensed = new Map<number, {
      nodes: T[];
      edges: number[];
    }>();

    for (const [node, color] of this.#colorMap.entries()) {
      const entry = condensed.get(color) ?? { nodes: [], edges: [] };
      entry.nodes.push(node);

      for (const [neighbor] of this.#graph.get(node) ?? []) {
        const neighborColor = this.#colorMap.get(neighbor)!;
        if (color !== neighborColor) {
          entry.edges.push(neighborColor);
        }
      }

      condensed.set(color, entry);
    }

    return condensed;
  }

  order(a: T): number {
    const order = this.#orderMap.get(a);

    if (order === undefined) {
      throw new Error("SCC not built yet");
    }
    return order;
  }
}
