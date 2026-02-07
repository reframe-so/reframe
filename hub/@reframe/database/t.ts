export * from "./schema/index.ts";

export * from "./server/server.ts";

export * from "./adapter/index.ts";

import { v4 } from "npm:uuid@latest";

export const uuid = (): string => v4();
