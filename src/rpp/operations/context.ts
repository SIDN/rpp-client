import { processLinks, queueSizeOf } from "../client/links";
import type { HttpMethod, QueryParameters } from "../client/request";
import type { RppHttpResponse } from "../client/response";
import type { RppTransport } from "../client/RppTransport";
import { classifyResponse, RppError, toFailure } from "../errors/RppError";
import type { ParsedResultCode } from "../core/status/resultCodes";
import type { ValidationResult } from "../schemas/validation";
import { authorizationHeaderValue } from "./authorization";
import type { CallOptions, OperationSuccess, ResponseMeta, ValidationConfig, ValidationMode } from "./types";

export interface OperationContext {
  transport: RppTransport;
  validation: ValidationConfig | undefined;
  language: string | undefined;
}

export interface OperationSpec {
  method: HttpMethod;
  /** Relative to the base URL. */
  target: string;
  query?: QueryParameters;
  body?: unknown;
  options?: CallOptions;
  /** Schema definition the request body is checked against, such as `domainName.create`. */
  requestDefinition?: string;
  /** Schema definition the response body is checked against, such as `domainName.read`. */
  responseDefinition?: string;
}

export interface Exchange {
  response: RppHttpResponse;
  clientTransactionId: string;
  requestValidation: ValidationResult | undefined;
}

function check(
  context: OperationContext,
  direction: "request" | "response",
  definition: string | undefined,
  value: unknown,
  mode: ValidationMode,
): ValidationResult | undefined {
  const config = context.validation;
  if (!config || definition === undefined || mode === "off") return undefined;
  const result = config.registry.validate(config.preset, definition, value);
  if (result.status === "invalid" && mode === "enforce") {
    const first = result.issues[0];
    throw new RppError({
      kind: "schema-validation",
      direction,
      definition,
      issues: result.issues,
      message: `The ${direction} does not conform to ${definition}: ${result.issues.length} issue(s), first ${first?.instancePath || "/"} ${first?.message ?? ""}`.trim(),
    });
  }
  return result;
}

/** Sends the request. Transport failures and invalid requests are thrown as `RppError`; any HTTP status is returned. */
export async function exchange(context: OperationContext, spec: OperationSpec): Promise<Exchange> {
  const options = spec.options ?? {};
  const requestValidation = check(
    context,
    "request",
    spec.requestDefinition,
    spec.body,
    options.validation ?? context.validation?.request ?? "enforce",
  );
  const clientTransactionId = options.clientTransactionId;
  try {
    const headers: Record<string, string> = {};
    const language = options.language ?? context.language;
    if (language) headers["Accept-Language"] = language;
    if (options.authorization) headers["RPP-Authorization"] = authorizationHeaderValue(options.authorization);
    const response = await context.transport.send({
      method: spec.method,
      target: spec.target,
      query: spec.query,
      body: spec.body,
      headers,
      clientTransactionId,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
    return { response, clientTransactionId: response.sentClientTransactionId, requestValidation };
  } catch (error) {
    throw new RppError(toFailure(error));
  }
}

export function metaOf(
  exchanged: Exchange,
  resultCode: ParsedResultCode | undefined,
  warnings: readonly string[],
  responseValidation: ValidationResult | undefined,
): ResponseMeta {
  const { response } = exchanged;
  const links = processLinks(response.headers);
  const queue = queueSizeOf(response.headers);
  const all = [...warnings, ...links.warnings, ...queue.warnings];
  if (response.correlation.clientTransactionId !== exchanged.clientTransactionId) {
    all.push(
      response.correlation.clientTransactionId === null
        ? "The response does not echo RPP-Cltrid (core §6.2)."
        : "The response echoes a different RPP-Cltrid than the request sent (core §6.2).",
    );
  }
  return {
    status: response.status,
    resultCode,
    correlation: response.correlation,
    queueSize: queue.size,
    location: response.headers.get("location") ?? undefined,
    processes: links.links,
    warnings: all,
    validation: {
      ...(exchanged.requestValidation && { request: exchanged.requestValidation }),
      ...(responseValidation && { response: responseValidation }),
    },
    exchangeId: response.exchangeId,
    durationMs: response.durationMs,
    response,
  };
}

/** Sends the request and reads the response: any failure is thrown as `RppError`. */
export async function perform(context: OperationContext, spec: OperationSpec): Promise<OperationSuccess<unknown>> {
  const exchanged = await exchange(context, spec);
  const outcome = classifyResponse(exchanged.response);
  if (!outcome.ok) throw new RppError(outcome.failure);
  const responseValidation =
    outcome.data === undefined
      ? undefined
      : check(
          context,
          "response",
          spec.responseDefinition,
          outcome.data,
          spec.options?.validation ?? context.validation?.response ?? "warn",
        );
  const meta = metaOf(exchanged, outcome.resultCode, outcome.warnings, responseValidation);
  return { data: outcome.data, meta };
}
