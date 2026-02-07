import { type Describe, type Hash } from "./t.ts";
import type { SCC } from "../00-base/utils/scc.ts";

export type SccNodeSignature<S> = [
  Hash<S>,
  SccSignature<S>,
];

export type SccSignature<S> = Array<
  Describe<
    `list of all members in the strongly connected component
     and their dependencies, sorted by order`,
    [
      Hash<S>,
      Array<[
        // edge label
        string,
        // dependency is another member in this SCC
        | Hash<S>
        // dependency is not in this SCC
        | Hash<SccNodeSignature<S>>,
        // dependency is before or after the current member
        -1 | 1,
      ]>,
    ]
  >
>;

export async function sign<T extends string | number, S>(
  scc: SCC<T>,
  blocks: Map<T, S>,
  hash: <T>(content: T) => Promise<Hash<T>>,
): Promise<Map<T, Hash<SccNodeSignature<S>>>> {
  scc.build();
  const condensed = scc.condense();

  const topoOrder = Array.from(condensed.keys())
    .sort((a, b) => b - a);

  const nodeSignature = new Map(
    await Promise.all(
      blocks.entries()
        .map(async ([id, block]) => [id, await hash(block)] as const),
    ),
  );

  const sccSignature = new Map<T, Hash<SccNodeSignature<S>>>();
  for (const id of topoOrder) {
    const nodes = condensed.get(id)!.nodes
      .sort((a, b) => scc.order(a) - scc.order(b));

    const common = new Set(nodes);
    const component: SccSignature<S> = [];

    for (const node of nodes) {
      const resolve: Array<[
        string,
        | Hash<S>
        | Hash<SccNodeSignature<S>>,
        -1 | 1,
      ]> = [];

      const edges = scc.getEdges(node);

      for (const [child, label] of edges) {
        resolve.push([
          label,
          common.has(child)
            ? nodeSignature.get(child)!
            : sccSignature.get(child)!,
          scc.order(child) > scc.order(node) ? 1 : -1,
        ]);
      }

      component.push([nodeSignature.get(node)!, resolve]);
    }

    await Promise.all(nodes.map(async (node) => {
      const n = [
        nodeSignature.get(node)!,
        component,
      ] satisfies SccNodeSignature<S>;

      const signature = `(${n[0]}/(${
        n[1].map(([from, deps]) =>
          from + "->(" +
          deps
            .map(([label, to, order]) =>
              (order === -1 ? "-" : "+") + label + ":" + to
            )
            .join("") +
          ")"
        )
          .join(",")
      }))`;

      const h = await hash(signature);

      sccSignature.set(node, h as unknown as Hash<SccNodeSignature<S>>);
    }));
  }

  return sccSignature;
}
