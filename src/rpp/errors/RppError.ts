import type { Correlation, ResponseBody, RppHttpResponse } from "../client/response";
import { parseResultCode, type ParsedResultCode } from "../core/status/resultCodes";
import type { ValidationIssue } from "../schemas/validation";
import { DiscoveryError, type DiscoveryErrorKind } from "./DiscoveryError";
import { parseRppProblem, type RppProblem } from "./problem";
import { TransportError, type TransportErrorKind } from "./TransportError";

interface ResponseDetails {
  status: number;
  statusText: string;
  /** From the `RPP-Code` header; undefined when absent. */
  resultCode: ParsedResultCode | undefined;
  correlation: Correlation;
  /** Links to the diagnostics record of the exchange. */
  exchangeId: string;
  message: string;
  /** Deviations from the specification that did not prevent reading the response. */
  warnings: string[];
}

/**
 * What can go wrong, normalized without losing what the server or the transport reported. A value of `kind` that no
 * screen handles still has a `message`. Nothing here is mapped to a different known error.
 */
export type RppFailure =
  | { kind: "transport"; transportKind: TransportErrorKind; message: string; exchangeId: string | undefined }
  | ({ kind: "authentication" | "authorization"; problem: RppProblem | undefined } & ResponseDetails)
  | ({ kind: "rpp-protocol"; problem: RppProblem } & ResponseDetails)
  | ({ kind: "http"; body: ResponseBody } & ResponseDetails)
  | ({ kind: "content"; reason: "malformed-json" | "unexpected-media-type"; body: ResponseBody } & ResponseDetails)
  | {
      kind: "schema-validation";
      direction: "request" | "response";
      definition: string;
      issues: ValidationIssue[];
      message: string;
    }
  | { kind: "schema-document"; message: string }
  | { kind: "discovery"; discoveryKind: DiscoveryErrorKind; status: number | undefined; message: string; exchangeId: string | undefined }
  | { kind: "unknown"; message: string; cause: unknown };

export type RppFailureKind = RppFailure["kind"];

/** The failures that come from reading a response. */
export type ResponseFailure = Extract<
  RppFailure,
  { kind: "authentication" | "authorization" | "rpp-protocol" | "http" | "content" }
>;

/** Carries an `RppFailure` through promise rejections, such as TanStack Query's. */
export class RppError extends Error {
  readonly failure: RppFailure;

  constructor(failure: RppFailure) {
    super(failure.message);
    this.name = "RppError";
    this.failure = failure;
  }
}

/** Reads any error a layer of this client throws as a failure. Unrecognized errors stay inspectable as `unknown`. */
export function toFailure(error: unknown): RppFailure {
  if (error instanceof RppError) return error.failure;
  if (error instanceof TransportError) {
    return { kind: "transport", transportKind: error.kind, message: error.message, exchangeId: error.exchange?.id };
  }
  if (error instanceof DiscoveryError) {
    return {
      kind: "discovery",
      discoveryKind: error.kind,
      status: error.status,
      message: error.message,
      exchangeId: error.exchangeId,
    };
  }
  return { kind: "unknown", message: error instanceof Error ? error.message : String(error), cause: error };
}

/** A cancelled request is not a failure to show. */
export const isAbort = (failure: RppFailure): boolean =>
  failure.kind === "transport" && failure.transportKind === "aborted";

export type RppOutcome =
  | {
      ok: true;
      response: RppHttpResponse;
      /** The parsed JSON body; undefined for an empty one. */
      data: unknown;
      resultCode: ParsedResultCode | undefined;
      warnings: string[];
    }
  | { ok: false; response: RppHttpResponse; failure: ResponseFailure };

function describeProblem(problem: RppProblem, statusText = ""): string {
  const first = problem.errors[0];
  const reason = first ? `${first.reason || problem.detail || first.result.description} (${first.result.raw})` : problem.detail;
  // A title that only repeats the HTTP reason phrase adds nothing.
  const title = problem.title.toLowerCase() === statusText.toLowerCase() ? "" : problem.title;
  return [title, reason].filter(Boolean).join(": ") || "RPP error";
}

/**
 * Reads a response against the RPP response model: the HTTP status says whether the request succeeded, the body of a
 * failure is a Problem Detail (core §9), and `RPP-Code` carries the result code (core §6.2). A 2xx whose body cannot
 * be read as JSON is a failure, not a success without data.
 */
export function classifyResponse(response: RppHttpResponse): RppOutcome {
  const { status, statusText, body, correlation } = response;
  const headerCode = correlation.resultCode === null ? undefined : parseResultCode(correlation.resultCode);
  const warnings: string[] = [];
  const details = (message: string): ResponseDetails => ({
    status,
    statusText,
    resultCode: headerCode,
    correlation,
    exchangeId: response.exchangeId,
    message,
    warnings,
  });

  if (headerCode === undefined) warnings.push("The response has no RPP-Code header (core §6.2).");

  if (status >= 200 && status < 300) {
    if (body.kind === "malformed-json" || body.kind === "unexpected-media-type") {
      const detail = body.kind === "malformed-json" ? `malformed JSON (${body.message})` : `media type ${body.mediaType ?? "none"}`;
      return {
        ok: false,
        response,
        failure: { kind: "content", reason: body.kind, body, ...details(`HTTP ${status} with an unreadable body: ${detail}`) },
      };
    }
    if (headerCode?.outcome === "failure") warnings.push(`HTTP ${status} carries the failure result code ${headerCode.raw}.`);
    return { ok: true, response, data: body.kind === "json" ? body.value : undefined, resultCode: headerCode, warnings };
  }

  const problem = body.kind === "json" ? parseRppProblem(body.value) : undefined;
  if (problem) {
    warnings.push(...problem.warnings.map((warning) => `Problem Detail ${warning}`));
    if (problem.status !== undefined && problem.status !== status) {
      warnings.push(`Problem Detail status ${problem.status} differs from HTTP status ${status}.`);
    }
  }

  const base = `HTTP ${status}${statusText ? ` ${statusText}` : ""}`;
  if (status === 401 || status === 403) {
    const kind = status === 401 ? "authentication" : "authorization";
    return {
      ok: false,
      response,
      failure: { kind, problem, ...details(problem ? `${base}: ${describeProblem(problem, statusText)}` : base) },
    };
  }
  if (problem) {
    return { ok: false, response, failure: { kind: "rpp-protocol", problem, ...details(`${base}: ${describeProblem(problem, statusText)}`) } };
  }
  return { ok: false, response, failure: { kind: "http", body, ...details(base) } };
}

/** The value of a successful response, or an `RppError` for any failure. */
export function unwrap(outcome: RppOutcome): unknown {
  if (outcome.ok) return outcome.data;
  throw new RppError(outcome.failure);
}
