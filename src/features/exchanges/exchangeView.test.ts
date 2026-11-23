import { describe, expect, it } from "vitest";
import type { ExchangeRecord } from "@/rpp/client/diagnostics";
import { filterExchanges, formatBody, summarize, targetOf } from "./exchangeView";

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
});
