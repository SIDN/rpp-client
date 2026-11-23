import type { ExchangeListener } from "./diagnostics";
import type { PresetSignalling } from "./negotiation";
import type { ProgressListener } from "./progress";
import type { RppRequest } from "./request";
import type { RppHttpResponse } from "./response";

/** Sends one request and returns the response of any HTTP status. Rejects with `TransportError`. */
export interface RppTransport {
  send(request: RppRequest): Promise<RppHttpResponse>;
}

/**
 * - `reject`: a redirect is an error. Default; a browser hides the target of a redirect when it is not followed natively.
 * - `follow-allowed`: the browser follows redirects itself, and the final URL must be on an allowed origin
 *   afterwards. A hop to another origin is requested before the check, and headers other than `Authorization`
 *   are not stripped by the browser.
 */
export type RedirectPolicy = "reject" | "follow-allowed";

export interface AuthorizationContext {
  method: string;
  url: URL;
}

/** Called per request, for the base origin only. */
export type AuthorizationHeaderSource = (context: AuthorizationContext) => Promise<Readonly<Record<string, string>>>;

export interface TransportConfig {
  baseUrl: string;
  /** Origins, besides the base origin, that absolute targets and redirects may use. Credentials go to the base origin only. */
  allowedOrigins?: readonly string[];
  /** Development only: permits `http:` URLs. */
  allowInsecureHttp?: boolean;
  fetch?: typeof fetch;
  /** Default 30000; 0 disables. */
  timeoutMs?: number;
  redirectPolicy?: RedirectPolicy;
  /** Default `omit`: no cookies. */
  credentials?: RequestCredentials;
  /** Default `["application/rpp+json"]`. `application/problem+json` is always accepted in the response. */
  accept?: readonly string[];
  /** A function is asked for every request, so the preset can change while the transport lives. */
  preset?: PresetSignalling | (() => PresetSignalling | undefined);
  authorizationHeaders?: AuthorizationHeaderSource;
  /** Receives every redacted exchange, successful or not. Throwing from it does not affect the request. */
  onExchange?: ExchangeListener;
  /** Receives each request as it starts, is sent, is answered and is read. Throwing from it does not affect the request. */
  onProgress?: ProgressListener;
  /** RPP-Cltrid for requests that give none. Default: `rpp-client-` and eight random digits, never repeated by one transport. */
  newClientTransactionId?: () => string;
  /** Lower-case header names redacted in diagnostics, besides the built-in ones. */
  sensitiveHeaders?: readonly string[];
  /** Diagnostics keep at most this many characters of a body. Default 100000. */
  maxDiagnosticBodyChars?: number;
}
