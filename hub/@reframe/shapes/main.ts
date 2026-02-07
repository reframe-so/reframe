/**
 * ---- extends ----
 * const a = t.create(...)
 * const b = t.create(...)
 * // does a extend b?
 * console.log(a.extends(b))
 *
 * ---- clean ----
 *
 * ---- at ----
 * shape.at(path, { defs })
 * -> returns a new shape at the path
 * -> look at access.ts for reference
 *
 * ---- serialize/desrialize ----
 * shape.serialize() -> json
 * shape.deserialize(json)
 */

import * as t from "./t.ts";

export { t };
export default t;
