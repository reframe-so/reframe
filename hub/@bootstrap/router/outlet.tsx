"use client";

import React, {
  createContext as createClientContext,
  Suspense,
  useContext,
  useState,
  useTransition,
} from "npm:react";

import { Guard } from "@bootstrap/render/boundaries.tsx";
import { createFromFetch } from "@bootstrap/render/web.tsx";

type Layers = {
  layout?: React.ReactNode;
  page?: React.ReactNode;
  routes: Record<string, Layers>;
};

export const OutletContext = createClientContext<React.ReactNode | null>(null);

const RouterContext = createClientContext<{
  layers: Layers;
  setLayers: (layers: Layers) => void;
  path: string;
  setPath: (path: string) => void;
}>({
  layers: { routes: {} },
  path: "/",
  setLayers: () => {
    throw new Error("RouterContext not initialized");
  },
  setPath: () => {
    throw new Error("RouterContext not initialized");
  },
});

const split = (p: string) => p.split("/").filter(Boolean);

const findDeepestPath = (layers: Layers, segs: string[]) => {
  const out: string[] = [];
  let cur = layers;
  for (const s of segs) {
    if (!cur.routes?.[s]) break;
    out.push(s);
    cur = cur.routes[s];
  }
  return out;
};

const hasPage = (layers: Layers, segs: string[]) =>
  segs.reduce<Layers | undefined>((acc, s) => acc?.routes?.[s], layers)?.page !=
    null;

/** Return `layers.routes[first]` if it exists, otherwise `layers` itself. */
const pickSubTree = (layers: Layers, segs: string[]): Layers =>
  segs.length && layers.routes?.[segs[0]] ? layers.routes[segs[0]] : layers;

const mergeTrees = (a: Layers, b: Layers): Layers => ({
  layout: b.layout ?? a.layout,
  page: b.page ?? a.page,
  routes: Object.fromEntries(
    [
      ...new Set([
        ...Object.keys(a.routes ?? {}),
        ...Object.keys(b.routes ?? {}),
      ]),
    ].map((k) => [
      k,
      a.routes?.[k] && b.routes?.[k]
        ? mergeTrees(a.routes[k], b.routes[k])
        : (a.routes?.[k] ?? b.routes?.[k])!,
    ]),
  ),
});

const cloneNode = (n: Layers): Layers => ({ ...n, routes: { ...n.routes } });

const mergeLayers = (
  base: Layers,
  existingPath: string[],
  newSegs: string[],
  next: Layers,
): Layers => {
  if (existingPath.length === 0 && newSegs.length === 0) {
    return mergeTrees(base, next);
  }

  const root = cloneNode(base);
  let dst = root;
  let src = base;

  for (const seg of existingPath) {
    const srcChild = src.routes?.[seg] ?? { routes: {} };
    const dstChild = cloneNode(srcChild);
    dst.routes[seg] = dstChild;
    dst = dstChild;
    src = srcChild;
  }

  // Case 1: fetched layout/page that completes `existingPath`.
  if (newSegs.length === 0) {
    dst.layout = next.layout ?? dst.layout;
    dst.page = next.page ?? dst.page;
    dst.routes = { ...dst.routes, ...next.routes };
    return root;
  }

  // Case 2: fetched deeper children under `head`.
  const head = newSegs[0];
  const incomingSubTree = pickSubTree(next, newSegs);

  dst.routes[head] = dst.routes[head]
    ? mergeTrees(dst.routes[head], incomingSubTree)
    : incomingSubTree;

  return root;
};

export const Outlet = () => <Suspense>{useContext(OutletContext)}</Suspense>;

const Combine = ({
  layers,
  segments,
}: {
  layers: Layers;
  segments: string[];
}): React.ReactNode => {
  const { layout, page, routes } = layers;
  const [seg, ...rest] = segments;

  // Leaf or unknown path
  if (!seg || !routes[seg]) {
    return layout
      ? (
        <OutletContext.Provider value={page ?? null}>
          <Guard>{layout}</Guard>
        </OutletContext.Provider>
      )
      : (
        page ?? null
      );
  }

  // Valid child; recurse
  const nested = <Combine layers={routes[seg]} segments={rest} />;
  return layout
    ? (
      <OutletContext.Provider value={nested}>
        <Guard>{layout}</Guard>
      </OutletContext.Provider>
    )
    : nested;
};

const RenderLayers = () => {
  const { layers, path } = useContext(RouterContext);
  return <Combine layers={layers} segments={split(path)} />;
};

export function Render({
  layers: initialLayers,
  path: initialPath = "/",
}: {
  layers: Layers;
  path?: string;
}): React.ReactNode {
  const [layers, updateLayers] = useState(initialLayers);
  const [path, updatePath] = useState(initialPath);
  const [, startTransition] = useTransition();

  const setLayers = (l: Layers) => startTransition(() => updateLayers(l));
  const setPath = (p: string) => startTransition(() => updatePath(p));

  return (
    <RouterContext.Provider value={{ layers, setLayers, path, setPath }}>
      <RenderLayers />
    </RouterContext.Provider>
  );
}

export const useRouter = () => {
  const { layers, setLayers, path, setPath } = useContext(RouterContext);

  const push = async (target: `/${string}`) => {
    // const targetSegs = split(target);
    // const existing = findDeepestPath(layers, targetSegs);

    // if (existing.length === targetSegs.length && hasPage(layers, targetSegs)) {
    //   setPath(target);
    //   history.pushState(null, "", target);
    //   return;
    // }

    // const fetchFrom =
    //   existing.length === targetSegs.length
    //     ? targetSegs.slice(0, -1)
    //     : existing;
    // const newSegs = targetSegs.slice(fetchFrom.length);

    // const fetchPath =
    //   fetchFrom.length > 0
    //     ? `/${fetchFrom.join("/")}/:~/${newSegs.join("/")}`
    //     : `/${newSegs.join("/")}`;

    try {
      console.log("[fetchPath]", target);
      const incoming = await createFromFetch<Layers>(target, {
        headers: { "x-reframe-rsc": "true" },
      });

      // setLayers(mergeLayers(layers, fetchFrom, newSegs, incoming));
      setLayers(incoming);
      setPath(target);
      history.pushState(null, "", target);
    } catch (err) {
      console.error("Failed to fetch new layers:", err);
    }
  };

  return { push, currentPath: path };
};
