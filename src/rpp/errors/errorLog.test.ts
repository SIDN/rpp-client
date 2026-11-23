import { describe, expect, it, vi } from "vitest";
import type { ExchangeRecord } from "../client/diagnostics";
import { createFetchTransport } from "../client/FetchTransport";
import { createErrorLog, errorOf } from "./errorLog";

const BASE = "https://rpp.example.test/rpp";

const record = (outcome: ExchangeRecord["outcome"], url = `${BASE}/domainNames/example.test`): ExchangeRecord => ({
  id: "x-1",
  startedAt: "2026-01-01T10:00:00.000Z",
  durationMs: 12,
  request: { method: "GET", url, headers: { "rpp-cltrid": "C-1" }, body: undefined },
  outcome,
});

const response = (status: number, body: unknown, headers: Record<string, string> = {}): ExchangeRecord["outcome"] => ({
  kind: "response",
  status,
  statusText: "",
  url: `${BASE}/x`,
  redirected: false,
  headers,
  body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  bodyTruncated: false,
});

const problem = {
  type: "urn:ietf:params:rpp:error",
  title: "Unauthorized",
  detail: "Provided authorization is not valid",
  status: 401,
  errors: [{ type: "urn:ietf:params:rpp:error", result: "02200", reason: "Provided authorization is not valid" }],
};

describe("errorOf", () => {
  it("is nothing for a success or a redirect", () => {
    expect(errorOf(record(response(200, {})))).toBeUndefined();
    expect(errorOf(record(response(302, undefined)))).toBeUndefined();
  });

  it("reads a Problem Detail, with its result code and the ids", () => {
    const error = errorOf(record(response(401, problem, { "rpp-code": "02200", "rpp-svtrid": "S-9" })));
    expect(error).toMatchObject({
      kind: "response",
      status: 401,
      summary: "Unauthorized: Provided authorization is not valid",
      resultCode: { raw: "02200" },
      problem: { detail: "Provided authorization is not valid" },
      clientTransactionId: "C-1",
      serverTransactionId: "S-9",
      exchangeId: "x-1",
    });
  });

  it("takes the result code of the problem when there is no RPP-Code header", () => {
    expect(errorOf(record(response(409, { ...problem, status: 409, errors: [{ type: "t", result: "02302", reason: "Exists" }] })))?.resultCode?.raw).toBe("02302");
  });

  it("keeps an error whose body is not a Problem Detail", () => {
    const error = errorOf(record(response(502, "<h1>Bad gateway</h1>")));
    expect(error).toMatchObject({ kind: "response", status: 502, summary: "HTTP 502", problem: undefined, responseBody: "<h1>Bad gateway</h1>" });
  });

  it("keeps a request that got no answer", () => {
    expect(errorOf(record({ kind: "error", errorKind: "network", message: "Network request failed: down" }))).toMatchObject({
      kind: "transport",
      status: undefined,
      summary: "Network request failed: down",
    });
  });

  it("does not count 'not available' as an error", () => {
    const url = `${BASE}/domainNames/taken.test/availability`;
    expect(errorOf(record(response(404, { "@type": "domainNameAvailability", available: false }), url))).toBeUndefined();
    expect(errorOf(record(response(404, undefined), url))).toBeUndefined();
    expect(errorOf(record(response(404, problem)))).toBeDefined();
    expect(errorOf(record(response(500, problem), url))).toBeDefined();
  });
});

describe("error log", () => {
  it("keeps errors only, newest last, numbered and bounded, and survives being cleared", () => {
    const log = createErrorLog(2);
    const listener = vi.fn();
    log.subscribe(listener);
    log.record(record(response(200, {})));
    expect(log.entries()).toEqual([]);
    expect(listener).not.toHaveBeenCalled();

    for (const status of [400, 404, 500]) log.record(record(response(status, undefined)));
    expect(log.entries().map((entry) => [entry.seq, entry.status])).toEqual([[2, 404], [3, 500]]);
    log.clear();
    expect(log.entries()).toEqual([]);
    log.record(record(response(409, undefined)));
    expect(log.entries()[0]?.seq).toBe(4);
  });

  it("is fed by a transport and never holds the credentials", async () => {
    const log = createErrorLog();
    const transport = createFetchTransport({
      baseUrl: BASE,
      onExchange: log.record,
      authorizationHeaders: async () => ({ Authorization: "Basic c2VjcmV0" }),
      fetch: async () => new Response(JSON.stringify(problem), { status: 401, headers: { "Content-Type": "application/problem+json", "RPP-Code": "02200" } }),
    });
    await transport.send({ method: "GET", target: "domainNames/example.test" });
    expect(log.entries()).toHaveLength(1);
    expect(JSON.stringify(log.entries())).not.toContain("c2VjcmV0");
  });
});
