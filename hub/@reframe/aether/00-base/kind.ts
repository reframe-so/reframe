import { Blob } from "./common.ts";

export interface Kind<T> {
  serialize(
    data: T,
    metadata?: Record<string, string | null>,
  ): Promise<Blob<T>>;
  deserialize(blob: Blob<T>): Promise<T>;
}

export const kind = <T>(_: Kind<T>): Kind<T> => _;
