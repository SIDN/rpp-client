import type { ExchangeListener, ExchangeRecord } from "../client/diagnostics";
import { parseResultCode, type ParsedResultCode } from "../core/status/resultCodes";
import { parseRppProblem, type RppProblem } from "./problem";

/** One request that ended in an error, as the redacted exchange recorded it. */
export interface ErrorEntry {
  /** Rises with every entry, also after the log was cleared. */
  seq: number;
  /** Id of the exchange record the entry comes from. */
  exchangeId: string;
  /** ISO 8601, client clock. */
  at: string;
  durationMs: number;
  method: string;
  url: string;
  /** `transport`: no response came. `response`: the server answered with an error status. */
  kind: "transport" | "response";
  status: number | undefined;
  statusText: string;
  /** One line: the problem's title and reason, else the HTTP status, else why no response came. */
  summary: string;
  /** From the RPP-Code header, else the first error of the problem. */
  resultCode: ParsedResultCode | undefined;
  /** Present when the body is an RPP Problem Detail. */
  problem: RppProblem | undefined;
  clientTransactionId: string | undefined;
  serverTransactionId: string | undefined;
  requestBody: string | undefined;
  responseBody: string | undefined;
  /** The stored body is cut off, so it may not parse. */
  responseBodyTruncated: boolean;
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Core §16.4: for an availability request a 404 is the answer "no", not an error. */
function isAvailabilityAnswer(record: ExchangeRecord, body: unknown): boolean {
  if (record.outcome.kind !== "response" || record.outcome.status !== 404) return false;
  const type = typeof body === "object" && body !== null ? (body as { "@type"?: unknown })["@type"] : undefined;
  if (typeof type === "string" && type.endsWith("Availability")) return true;
  try {
    return new URL(record.request.url).pathname.endsWith("/availability");
  } catch {
    return false;
  }
}

/** The error an exchange ended in, or undefined when it ended well. */
export function errorOf(record: ExchangeRecord): Omit<ErrorEntry, "seq"> | undefined {
  const { outcome, request } = record;
  const common = {
    exchangeId: record.id,
    at: record.startedAt,
    durationMs: record.durationMs,
    method: request.method,
    url: request.url,
    clientTransactionId: request.headers["rpp-cltrid"],
    requestBody: request.body,
  };

  if (outcome.kind === "error") {
    return {
      ...common,
      kind: "transport",
      status: undefined,
      statusText: "",
      summary: outcome.message,
      resultCode: undefined,
      problem: undefined,
      serverTransactionId: undefined,
      responseBody: undefined,
      responseBodyTruncated: false,
    };
  }

  if (outcome.status < 400) return undefined;
  const body = parseJson(outcome.body);
  if (isAvailabilityAnswer(record, body)) return undefined;

  const problem = parseRppProblem(body);
  const header = outcome.headers["rpp-code"];
  const resultCode = header !== undefined ? parseResultCode(header) : problem?.errors[0]?.result;
  const reason = problem?.errors[0]?.reason || problem?.detail;
  const http = `HTTP ${outcome.status}${outcome.statusText ? ` ${outcome.statusText}` : ""}`;
  return {
    ...common,
    kind: "response",
    status: outcome.status,
    statusText: outcome.statusText,
    summary: problem ? [problem.title, reason].filter(Boolean).join(": ") || http : http,
    resultCode,
    problem,
    serverTransactionId: outcome.headers["rpp-svtrid"],
    responseBody: outcome.body,
    responseBodyTruncated: outcome.bodyTruncated,
  };
}

/** In-memory, bounded history of the errors of a session; shaped for `useSyncExternalStore`. */
export interface ErrorLog {
  /** Takes every exchange and keeps those that ended in an error. */
  readonly record: ExchangeListener;
  /** Oldest first. */
  entries(): readonly ErrorEntry[];
  subscribe(listener: () => void): () => void;
  clear(): void;
}

export function createErrorLog(capacity = 200): ErrorLog {
  let entries: readonly ErrorEntry[] = [];
  let sequence = 0;
  const listeners = new Set<() => void>();

  return {
    record(record) {
      const error = errorOf(record);
      if (!error) return;
      entries = [...entries, { ...error, seq: ++sequence }].slice(-capacity);
      listeners.forEach((listener) => listener());
    },
    entries: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear() {
      entries = [];
      listeners.forEach((listener) => listener());
    },
  };
}
