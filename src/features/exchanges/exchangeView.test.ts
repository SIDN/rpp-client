import { describe, expect, it } from "vitest";
import type { ExchangeRecord } from "@/rpp/client/diagnostics";
import { filterExchanges, formatBody, rawExchange, rawRequest, rawResponse, summarize, targetOf } from "./exchangeView";

const record = (id: string, status: number | "error", url = "https://rpp.example.test/rpp/hosts/a?x=1"): ExchangeRecord => ({
  id,
  startedAt: "2026-01-01T00:00:00.000Z",
  durationMs: 5,
  request: { method: "GET", url, headers: { "rpp-cltrid": `rpp-client-${id}` }, body: undefined },
  outcome:
    status === "error"
      ? { kind: "error", errorKind: "network", message: "down" }
      : { kind: "response", status, statusText: "", url, redirected: false, headers: { "rpp-code": "01000", "rpp-svtrid": `S-${id}` }, body: undefined, bodyTruncated: false },
});

describe("exchange view", () => {
  it("shows the path and query of an address", () => {
    expect(targetOf("https://rpp.example.test/rpp/hosts/a?x=1")).toBe("/rpp/hosts/a?x=1");
    expect(targetOf("not a url")).toBe("not a url");
  });

  it("summarizes the outcome by status class", () => {
    expect(summarize(record("1", 200))).toMatchObject({ outcome: "200", tone: "success", resultCode: "01000" });
    expect(summarize(record("2", 302)).tone).toBe("warning");
    expect(summarize(record("3", 503)).tone).toBe("danger");
    expect(summarize(record("4", "error"))).toMatchObject({ outcome: "No response", tone: "danger", resultCode: undefined });
  });

  it("formats complete JSON only", () => {
    expect(formatBody('{"a":1}')).toEqual({ text: '{\n  "a": 1\n}', formatted: true });
    expect(formatBody('{"a":')).toEqual({ text: '{"a":', formatted: false });
  });

  it("filters newest first on every word", () => {
    const all = [record("1", 200), record("2", 404, "https://rpp.example.test/rpp/domainNames/b"), record("3", 200)];
    expect(filterExchanges(all, "").map((r) => r.id)).toEqual(["3", "2", "1"]);
    expect(filterExchanges(all, "domainnames 404").map((r) => r.id)).toEqual(["2"]);
    expect(filterExchanges(all, "S-1").map((r) => r.id)).toEqual(["1"]);
    expect(filterExchanges(all, "rpp-client-3").map((r) => r.id)).toEqual(["3"]);
    expect(filterExchanges(all, "nothing")).toEqual([]);
  });

  it("writes a request as raw text from the redacted record", () => {
    const sent: ExchangeRecord = {
      ...record("1", 201),
      request: {
        method: "POST",
        url: "https://rpp.example.test/rpp/domainNames",
        headers: { authorization: "[REDACTED]", "content-type": "application/rpp+json" },
        body: '{"name":"a.example","authInfo":"[REDACTED]"}',
      },
    };
    expect(rawRequest(sent)).toBe(
      'POST https://rpp.example.test/rpp/domainNames\nauthorization: [REDACTED]\ncontent-type: application/rpp+json\n\n{"name":"a.example","authInfo":"[REDACTED]"}',
    );
    expect(rawRequest(record("2", 200))).toBe("GET https://rpp.example.test/rpp/hosts/a?x=1\nrpp-cltrid: rpp-client-2");
  });

  it("writes a response as raw text and marks what is incomplete", () => {
    const base = record("1", 404);
    if (base.outcome.kind !== "response") throw new Error("fixture");
    const outcome = { ...base.outcome, statusText: "Not Found", headers: { "set-cookie": "[REDACTED]" }, body: '{"title":"x"}' };
    expect(rawResponse({ ...base, outcome })).toBe('HTTP 404 Not Found\nset-cookie: [REDACTED]\n\n{"title":"x"}');
    expect(rawResponse({ ...base, outcome: { ...outcome, statusText: "", body: undefined, headers: {} } })).toBe("HTTP 404");

    const clipped = rawResponse({ ...base, outcome: { ...outcome, bodyTruncated: true, redirected: true, url: "https://other.example.test/x" } });
    expect(clipped.split("\n")[0]).toBe("# Redirected: the response came from https://other.example.test/x");
    expect(clipped.endsWith("\n# Body truncated: only the first part was recorded.")).toBe(true);

    expect(rawResponse(record("2", "error"))).toBe("# No response (network): down");
  });

  it("writes a whole exchange as request, blank line, response", () => {
    const exchange = record("3", 200);
    expect(rawExchange(exchange)).toBe(`${rawRequest(exchange)}\n\n${rawResponse(exchange)}`);
  });
});
