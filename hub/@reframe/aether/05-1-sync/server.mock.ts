import { logn as blob } from "../04-blob/logn.mock.ts";
import { yan } from "../05-yan/yan.mock.ts";
import { server } from "./server.ts";

export const mockServer = server(yan, blob);
