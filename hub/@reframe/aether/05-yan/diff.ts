const diff = (a: string[], b: string[]) => {
  if (a.length > b.length) {
    return diff(b, a);
  }

  const offset = a.length + 1;

  const path = Array<number>(a.length + b.length + 3).fill(-1);

  const position = [] as Array<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    r: number;
  }>;

  const snake = (k: number, p: number, pp: number) => {
    const r = p > pp ? path[k - 1 + offset] : path[k + 1 + offset];

    const startY = Math.max(p, pp);
    const startX = startY - k;

    let x = startX, y = startY;

    while (x < a.length && y < b.length && a[x] === b[y]) {
      ++x;
      ++y;
    }

    if (startX == x && startY == y) {
      path[k + offset] = r;
    } else {
      path[k + offset] = position.length;

      position[position.length] = {
        startX,
        startY,
        endX: x,
        endY: y,
        r,
      };
    }

    return y;
  };

  const delta = b.length - a.length;
  const fp = Array<number>(a.length + b.length + 3).fill(-1);

  let p = -1;

  while (fp[delta + offset] !== b.length) {
    ++p;
    for (let k = -p; k <= delta - 1; ++k) {
      fp[k + offset] = snake(k, fp[k - 1 + offset] + 1, fp[k + 1 + offset]);
    }
    for (let k = delta + p; k >= delta + 1; --k) {
      fp[k + offset] = snake(k, fp[k - 1 + offset] + 1, fp[k + 1 + offset]);
    }
    fp[delta + offset] = snake(
      delta,
      fp[delta - 1 + offset] + 1,
      fp[delta + 1 + offset],
    );
  }

  let r = path[delta + offset];
  let lastStartX = a.length, lastStartY = b.length;

  const result = [] as Array<{
    file1: [number, number];
    file2: [number, number];
  }>;

  while (r !== -1) {
    const elem = position[r];
    if (a.length != elem.endX || b.length != elem.endY) {
      result.push({
        file1: [
          elem.endX,
          lastStartX - elem.endX,
        ],
        file2: [
          elem.endY,
          lastStartY - elem.endY,
        ],
      });
    }

    lastStartX = elem.startX;
    lastStartY = elem.startY;

    r = position[r].r;
  }

  if (lastStartX != 0 || lastStartY != 0) {
    result.push({
      file1: [0, lastStartX],
      file2: [0, lastStartY],
    });
  }

  return result.reverse();
};

const diff3MergeIndices = (a: string[], o: string[], b: string[]) => {
  // (http://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf)

  const m1 = diff(o, a);
  const m2 = diff(o, b);

  const hunks = [] as Array<[number, 0 | 2, number, number, number]>;

  const addHunk = (h: {
    file1: [number, number];
    file2: [number, number];
  }, side: 0 | 2) => {
    hunks.push([h.file1[0], side, h.file1[1], h.file2[0], h.file2[1]]);
  };

  for (let i = 0; i < m1.length; i++) {
    addHunk(m1[i], 0);
  }

  for (let i = 0; i < m2.length; i++) {
    addHunk(m2[i], 2);
  }

  hunks.sort((x, y) => {
    return x[0] - y[0];
  });

  const result = [] as Array<
    [
      0 | 1 | 2,
      number,
      number,
    ] | [
      -1,
      number,
      number,
      number,
      number,
      number,
      number,
    ]
  >;
  let commonOffset = 0;

  for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex++) {
    const firstHunkIndex = hunkIndex;
    let hunk = hunks[hunkIndex];
    const regionLhs = hunk[0];
    let regionRhs = regionLhs + hunk[2];

    while (hunkIndex < hunks.length - 1) {
      const maybeOverlapping = hunks[hunkIndex + 1];
      const maybeLhs = maybeOverlapping[0];

      if (maybeLhs > regionRhs) {
        break;
      }

      regionRhs = Math.max(regionRhs, maybeLhs + maybeOverlapping[2]);
      hunkIndex++;
    }

    if (commonOffset < regionLhs) {
      result.push([1, commonOffset, regionLhs - commonOffset]);
      commonOffset = regionLhs;
    }

    if (firstHunkIndex == hunkIndex) {
      // The "overlap" was only one hunk long, meaning that
      // there's no conflict here. Either a and o were the
      // same, or b and o were the same.
      if (hunk[4] > 0) {
        result.push([hunk[1], hunk[3], hunk[4]]);
      }
    } else {
      // A proper conflict. Determine the extents of the
      // regions involved from a, o and b. Effectively merge
      // all the hunks on the left into one giant hunk, and
      // do the same for the right; then, correct for skew
      // in the regions of o that each side changed, and
      // report appropriate spans for the three sides.
      const regions = [
        [a.length, -1, o.length, -1],
        undefined,
        [b.length, -1, o.length, -1],
      ] as Record<0 | 2, [number, number, number, number]>;

      for (let i = firstHunkIndex; i <= hunkIndex; i++) {
        hunk = hunks[i];
        const side = hunk[1];
        const r = regions[side];
        const oLhs = hunk[0];
        const oRhs = oLhs + hunk[2];
        const abLhs = hunk[3];
        const abRhs = abLhs + hunk[4];

        r[0] = Math.min(abLhs, r[0]);
        r[1] = Math.max(abRhs, r[1]);
        r[2] = Math.min(oLhs, r[2]);
        r[3] = Math.max(oRhs, r[3]);
      }

      const aLhs = regions[0][0] + (regionLhs - regions[0][2]);
      const aRhs = regions[0][1] + (regionRhs - regions[0][3]);
      const bLhs = regions[2][0] + (regionLhs - regions[2][2]);
      const bRhs = regions[2][1] + (regionRhs - regions[2][3]);

      result.push([
        -1,
        aLhs,
        aRhs - aLhs,
        regionLhs,
        regionRhs - regionLhs,
        bLhs,
        bRhs - bLhs,
      ]);
    }
    commonOffset = regionRhs;
  }

  if (commonOffset < o.length) {
    result.push([1, commonOffset, o.length - commonOffset]);
  }

  return result;
};

export const diff3Merge = (a: string[], o: string[], b: string[]) => {
  const result: (
    | { ok: string[] }
    | {
      conflict: {
        a: string[];
        aIndex: number;
        o: string[];
        oIndex: number;
        b: string[];
        bIndex: number;
      };
    }
  )[] = [];

  const files = [a, o, b] as const;
  const indices = diff3MergeIndices(a, o, b);

  let buffer: string[] = [];

  function flushOk() {
    if (buffer.length) {
      result.push({
        ok: buffer,
      });
    }
    buffer = [];
  }

  function isTrueConflict(
    conflict: [-1, number, number, number, number, number, number],
  ) {
    if (conflict[2] != conflict[6]) return true;
    const aoff = conflict[1];
    const boff = conflict[5];
    for (let j = 0; j < conflict[2]; j++) {
      if (a[j + aoff] != b[j + boff]) return true;
    }
    return false;
  }

  for (const index of indices) {
    const side = index[0];

    if (side == -1) {
      if (!isTrueConflict(index)) {
        buffer.push(...files[0].slice(index[1], index[1] + index[2]));
      } else {
        flushOk();
        result.push({
          conflict: {
            a: a.slice(index[1], index[1] + index[2]),
            aIndex: index[1],
            o: o.slice(index[3], index[3] + index[4]),
            oIndex: index[3],
            b: b.slice(index[5], index[5] + index[6]),
            bIndex: index[5],
          },
        });
      }
    } else {
      buffer.push(...files[side].slice(index[1], index[1] + index[2]));
    }
  }

  flushOk();
  return result;
};

export const merge3Diff = (a: string, o: string, b: string) => {
  const result = diff3Merge(a.split("\n"), o.split("\n"), b.split("\n"));
  return result.map((r) => {
    if ("ok" in r) {
      return r.ok.join("\n");
    } else {
      return `<<<<<<< HEAD\n${r.conflict.a.join("\n")}\n=======\n${
        r.conflict.b.join("\n")
      }\n>>>>>>>`;
    }
  }).join("\n");
};
