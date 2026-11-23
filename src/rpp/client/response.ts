/** The body of a response, as far as the transport can tell. Nothing is thrown away: the raw text is always kept. */
export type ResponseBody =
  | { kind: "empty" }
  | { kind: "json"; value: unknown; text: string; mediaType: string }
  | { kind: "malformed-json"; text: string; mediaType: string; message: string }
  | { kind: "unexpected-media-type"; text: string; mediaType: string | null };

export interface Correlation {
  /** RPP-Cltrid as echoed by the server. */
  clientTransactionId: string | null;
  /** RPP-Svtrid */
  serverTransactionId: string | null;
  /** RPP-Code, the raw RPP result code. */
  resultCode: string | null;
}

/** An HTTP response of any status. Interpretation of status and protocol errors is the client's, not the transport's. */
export interface RppHttpResponse {
  status: number;
  statusText: string;
  /** Final URL, after any permitted redirect. */
  url: string;
  redirected: boolean;
  headers: Headers;
  body: ResponseBody;
  /** The RPP-Cltrid this request carried: the caller's, or one the transport made. */
  sentClientTransactionId: string;
  correlation: Correlation;
  /** Id of the matching diagnostics record. */
  exchangeId: string;
  durationMs: number;
}
