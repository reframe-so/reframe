import {
  diffCharsToLines,
  diffLinesToChars,
  diffMain,
  patchApply,
} from "npm:diff-match-patch-es";

export const diff = (text1: string, text2: string) => {
  const a = diffLinesToChars(text1, text2);
  const lineText1 = a.chars1;
  const lineText2 = a.chars2;
  const lineArray = a.lineArray;
  const diffs = diffMain(lineText1, lineText2, {}, false);
  diffCharsToLines(diffs, lineArray);
  // diffCleanupSemanticLossless(diffs);
  return diffs;
};

export const applyPatch = (
  ...args: Parameters<typeof patchApply>
) => patchApply(...args) as [string, boolean[]];
