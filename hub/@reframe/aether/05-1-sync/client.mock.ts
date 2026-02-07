import { logn as blob } from "../04-blob/logn.mock.ts";
import { yan } from "../05-yan/yan.mock.ts";
import { client, memoryStore } from "./client.ts";

export const mockClient = client(yan, blob, memoryStore());
