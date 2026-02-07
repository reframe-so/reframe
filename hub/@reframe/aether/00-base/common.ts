import { measure } from "./measure.ts";
import { crypto, encodeHex } from "./t.ts";

// Symbol for Hash kind
const HashKind = Symbol("Kind.Hash");

/**
 * A type representing a hash that is associated with content of type T.
 * This is a branded string type, meaning it's a string at runtime but
 * has a type association for compile-time checks.
 */
export type Hash<T> = string & {
  [HashKind]: T;
};

export type Describe<_ extends string, T> = T;

/**
 * Configuration similar to the Secrets type in Nether
 * Contains key-value pairs of configuration settings
 */
export type Config = Record<string, string>;

const BlobKind = Symbol("Kind.Blob");

export const XBlobHash = "x-blob-hash" as const;

/**
 * A Blob that extends Response and carries a type parameter
 * for compile-time type safety.
 */
export class Blob<T = unknown> extends Response {
  [BlobKind]: T = undefined as T;

  /**
   * Creates a new Blob with the specified body and headers
   * @param body The body of the blob, can be any valid BodyInit or null
   * @param headers Record of headers to include with the blob
   */
  constructor(
    body: BodyInit | null,
    metadata?: Record<string, string | null>,
  ) {
    const end = measure.start("Blob.new");
    super(body, {
      headers: Object.entries(metadata ?? {})
        .filter(([, value]) => value !== null) as [string, string][],
    });
    this.clone = measure("Blob.clone", this.clone.bind(this));
    end();
  }

  async hash(): Promise<Hash<T>> {
    const h = this.metadata[XBlobHash] as Hash<T> | undefined;
    if (h) {
      return h;
    }

    const bytes = await this.clone().bytes();
    const hashValue = await hash<T>(bytes);
    this.headers.set(XBlobHash, hashValue);
    return hashValue;
  }

  get metadata() {
    return Object.fromEntries(this.headers.entries());
  }

  override clone(): Blob<T> {
    const r = super.clone();
    return new Blob(r.body, this.metadata);
  }
}

const blake3 = measure(
  "blake3",
  (bytes: BufferSource) => crypto.subtle.digestSync("BLAKE3", bytes),
);

export const hash = async <T>(
  bytes: BufferSource,
) => encodeHex(await blake3(bytes)) as Hash<T>;
