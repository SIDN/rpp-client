export type DiscoveryErrorKind =
  /** No response could be obtained. */
  | "transport"
  /** The server answered with a status other than 200. */
  | "http"
  /** The body is empty, not JSON, or of an unexpected media type. */
  | "content"
  /** The body is JSON but not a discovery document. */
  | "invalid-document";

export class DiscoveryError extends Error {
  readonly kind: DiscoveryErrorKind;
  readonly status: number | undefined;
  /** Links the error to a diagnostics record. */
  readonly exchangeId: string | undefined;

  constructor(
    kind: DiscoveryErrorKind,
    message: string,
    details: { status?: number; exchangeId?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: details.cause });
    this.name = "DiscoveryError";
    this.kind = kind;
    this.status = details.status;
    this.exchangeId = details.exchangeId;
  }
}
