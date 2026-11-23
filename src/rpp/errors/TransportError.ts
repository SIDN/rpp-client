import type { ExchangeRecord } from "../client/diagnostics";

export type TransportErrorKind =
  | "configuration"
  | "invalid-request"
  | "origin-not-allowed"
  | "redirect-blocked"
  | "authentication"
  | "network"
  | "timeout"
  | "aborted";

/** A failure before an HTTP response could be obtained and read. A non-2xx response is not a transport error. */
export class TransportError extends Error {
  readonly kind: TransportErrorKind;
  /** Redacted record of the exchange that failed; set by the transport. */
  exchange: ExchangeRecord | undefined;

  constructor(kind: TransportErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TransportError";
    this.kind = kind;
  }
}
