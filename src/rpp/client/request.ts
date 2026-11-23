import type { PresetSignalling } from "./negotiation";

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

type QueryValue = string | number | boolean;

/** An array is sent as repeated parameters, one per value (core §16.1.7). */
export type QueryParameters = Readonly<Record<string, QueryValue | readonly QueryValue[] | undefined>>;

export interface RppRequest {
  method: HttpMethod;
  /** Path relative to the base URL, or an absolute URL (for example a server-provided link) on an allowed origin. */
  target: string;
  query?: QueryParameters;
  /** Additional headers. Headers the transport owns (Accept, Content-Type, RPP-Preset, RPP-Cltrid, Authorization, Cookie) are refused. */
  headers?: Readonly<Record<string, string>>;
  /** JSON-serializable body; not allowed with GET and HEAD. */
  body?: unknown;
  /** Bare media types or ranges to accept; defaults to the transport configuration. */
  accept?: readonly string[];
  /** Overrides the configured preset; `null` sends none. */
  preset?: PresetSignalling | null;
  /** RPP-Cltrid: printable ASCII. Generated when absent, so that every request has one. */
  clientTransactionId?: string;
  signal?: AbortSignal;
  /** Milliseconds; 0 disables the timeout. Defaults to the transport configuration. */
  timeoutMs?: number;
  /** Default true. False for public endpoints (discovery, schemas), which never need credentials. */
  authenticate?: boolean;
}
