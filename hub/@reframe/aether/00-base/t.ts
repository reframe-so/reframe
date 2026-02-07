import { measure } from "./measure.ts";

import { encodeHex as encodeHex_ } from "jsr:@std/encoding/hex";
import { encodeBase64 as encodeBase64_ } from "jsr:@std/encoding/base64";
import { encodeBase58 as _encodeBase58 } from "jsr:@std/encoding/base58";

export const encodeBase58 = measure("encodeBase58", _encodeBase58);
export const encodeHex = measure("encodeHex", encodeHex_);
export const encodeBase64 = measure("encodeBase64", encodeBase64_);

import { decodeBase58 as _decodeBase58 } from "jsr:@std/encoding/base58";

const decoder = new TextDecoder();
export const decodeBase58 = (input: string) =>
  decoder.decode(_decodeBase58(input));

export * as fs from "jsr:@std/fs";

export { crypto } from "jsr:@std/crypto";

export * from "@reframe/surprise/index.ts";
export { t as shapes } from "@reframe/shapes/main.ts";
export { t as database } from "@reframe/database/index.ts";

export {
  patch,
  patchApply,
  patchFromText,
  patchMake,
  patchToText,
} from "npm:diff-match-patch-es";

export * from "@reframe/utils/path.ts";
