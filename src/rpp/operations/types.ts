import type { RppHttpResponse, Correlation } from "../client/response";
import type { ProcessLink } from "../client/links";
import type { ParsedResultCode } from "../core/status/resultCodes";
import type { PresetSchemaKey, SchemaRegistry } from "../schemas/SchemaRegistry";
import type { ValidationResult } from "../schemas/validation";

/**
 * Object authorisation information, sent in the `RPP-Authorization` header and never in the body (core §6.1, json §4.9.3).
 * `value` is the password-based EPP authorisation information in clear; it is Base64-encoded for the header.
 */
export interface ObjectAuthorization {
  value: string;
  roid?: string;
}

/** `enforce` refuses to send, or to return, a payload that fails the schema; `warn` reports it; `off` skips the check. */
export type ValidationMode = "enforce" | "warn" | "off";

export interface ValidationConfig {
  registry: SchemaRegistry;
  /** The preset whose schema applies: the one signalled in requests. */
  preset: PresetSchemaKey;
  /** Default `enforce`. */
  request?: ValidationMode;
  /** Default `warn`: a server's answer is shown, not hidden, when it deviates. */
  response?: ValidationMode;
}

export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** RPP-Cltrid. Generated when absent. Reuse it only to deliberately repeat a request (it is an idempotency key). */
  clientTransactionId?: string;
  /** Accept-Language */
  language?: string;
  authorization?: ObjectAuthorization;
  /** Overrides the validation mode of the client, for request and response, for this call. */
  validation?: ValidationMode;
}

export interface ResponseMeta {
  status: number;
  /** From `RPP-Code`. */
  resultCode: ParsedResultCode | undefined;
  correlation: Correlation;
  /** `RPP-Queue-Size`: unacknowledged messages, when the server says. */
  queueSize: number | undefined;
  /** `Location`, as sent. */
  location: string | undefined;
  /** Processes the server created as a side effect. */
  processes: ProcessLink[];
  /** Deviations from the specification that did not prevent reading the response. */
  warnings: string[];
  /** `undefined` where no check was asked for or no definition applies. */
  validation: { request?: ValidationResult; response?: ValidationResult };
  /** Links to the diagnostics record of the exchange. */
  exchangeId: string;
  durationMs: number;
  response: RppHttpResponse;
}

export interface OperationSuccess<T> {
  /** The parsed body; undefined for an empty one. */
  data: T;
  meta: ResponseMeta;
}

export type AvailabilityResult<T> = {
  /** True when the object can be provisioned (HTTP 200), false when it cannot (HTTP 404). */
  available: boolean;
  /** The Availability Object; absent for a HEAD request. */
  details: T | undefined;
  meta: ResponseMeta;
};

/** `latest` addresses the most recent process, a process id one instance (core Rule 4). */
export type ProcessSelector = "latest" | { processId: string };
