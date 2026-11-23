import { describe, expect, it } from "vitest";
import type { ResponseBody, RppHttpResponse } from "../client/response";
import { DiscoveryError } from "./DiscoveryError";
import { classifyResponse, isAbort, RppError, toFailure, unwrap } from "./RppError";
import { RPP_ERROR_TYPE } from "./problem";
import { TransportError } from "./TransportError";

function response(status: number, body: ResponseBody, code: string | null = null): RppHttpResponse {
  return {
    status,
    statusText: "",
    url: "https://rpp.example.test/x",
    redirected: false,
    headers: new Headers(),
    body,
    sentClientTransactionId: "C-1",
    correlation: { clientTransactionId: "C-1", serverTransactionId: "S-1", resultCode: code },
    exchangeId: "x-1",
    durationMs: 1,
  };
}

const json = (value: unknown): ResponseBody => ({ kind: "json", value, text: JSON.stringify(value), mediaType: "application/rpp+json" });
const problem = (result: string, status?: number) =>
  json({ type: RPP_ERROR_TYPE, title: "RPP Error", ...(status ? { status } : {}), errors: [{ type: "t", result, reason: "Because" }] });

describe("classifyResponse", () => {
  it("returns the data of a success", () => {
    const outcome = classifyResponse(response(200, json({ "@type": "domainName" }), "01000"));
    expect(outcome).toMatchObject({ ok: true, data: { "@type": "domainName" }, warnings: [] });
    expect(outcome.ok && outcome.resultCode?.description).toBe("Command completed successfully");
  });

  it("accepts an empty success and warns about a missing or contradicting RPP-Code", () => {
    const empty = classifyResponse(response(204, { kind: "empty" }));
    expect(empty).toMatchObject({ ok: true, data: undefined });
    expect(empty.ok && empty.warnings).toEqual([expect.stringContaining("no RPP-Code")]);
    const contradicting = classifyResponse(response(200, json({}), "02303"));
    expect(contradicting.ok && contradicting.warnings).toEqual([expect.stringContaining("failure result code 02303")]);
  });

  it("treats a 2xx with an unreadable body as a failure", () => {
    const malformed = classifyResponse(response(200, { kind: "malformed-json", text: "{", mediaType: "application/rpp+json", message: "bad" }, "01000"));
    expect(malformed).toMatchObject({ ok: false, failure: { kind: "content", reason: "malformed-json" } });
    const html = classifyResponse(response(200, { kind: "unexpected-media-type", text: "<p>", mediaType: "text/html" }, "01000"));
    expect(html).toMatchObject({ ok: false, failure: { kind: "content", reason: "unexpected-media-type" } });
  });

  it("reads a Problem Detail as an RPP protocol error with its raw result codes", () => {
    const outcome = classifyResponse(response(404, problem("02303", 404), "02303"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure).toMatchObject({
      kind: "rpp-protocol",
      status: 404,
      exchangeId: "x-1",
      resultCode: { raw: "02303" },
      problem: { errors: [{ result: { raw: "02303" } }] },
      message: "HTTP 404: RPP Error: Because (02303)",
    });
    expect(outcome.failure.warnings).toEqual([]);
  });

  it("says the detail of a problem, and does not repeat the reason phrase as its title", () => {
    const body = json({ type: RPP_ERROR_TYPE, title: "Unauthorized", detail: "Provided authorization is not valid", status: 401, errors: [] });
    const outcome = classifyResponse({ ...response(401, body, "02200"), statusText: "Unauthorized" });
    expect(outcome.ok === false && outcome.failure).toMatchObject({
      message: "HTTP 401 Unauthorized: Provided authorization is not valid",
      problem: { detail: "Provided authorization is not valid" },
    });
  });

  it("keeps an unknown result code as received", () => {
    const outcome = classifyResponse(response(400, problem("12999"), "12999"));
    expect(outcome.ok === false && outcome.failure.kind === "rpp-protocol" && outcome.failure.problem.errors[0]?.result)
      .toMatchObject({ raw: "12999", known: false });
  });

  it("distinguishes authentication and authorization failures, with or without a problem", () => {
    expect(classifyResponse(response(401, problem("02200"), "02200"))).toMatchObject({
      failure: { kind: "authentication", problem: { title: "RPP Error" } },
    });
    expect(classifyResponse(response(403, { kind: "empty" }, "02201"))).toMatchObject({
      failure: { kind: "authorization", problem: undefined },
    });
  });

  it("falls back to an HTTP failure for other bodies, keeping the body", () => {
    const body: ResponseBody = { kind: "unexpected-media-type", text: "<h1>502</h1>", mediaType: "text/html" };
    expect(classifyResponse(response(502, body))).toMatchObject({ ok: false, failure: { kind: "http", status: 502, body } });
    const other = json({ type: "about:blank", title: "Nope" });
    expect(classifyResponse(response(500, other))).toMatchObject({ failure: { kind: "http", body: other } });
    expect(classifyResponse(response(302, { kind: "empty" }))).toMatchObject({ failure: { kind: "http", status: 302 } });
  });

  it("warns when the problem status differs from the HTTP status", () => {
    const outcome = classifyResponse(response(400, problem("02005", 422), "02005"));
    expect(outcome.ok === false && outcome.failure.warnings).toEqual([expect.stringContaining("differs from HTTP status 400")]);
  });
});

describe("failures as errors", () => {
  it("unwrap returns data and throws RppError for a failure", () => {
    expect(unwrap(classifyResponse(response(200, json([1]), "01000")))).toEqual([1]);
    expect(() => unwrap(classifyResponse(response(404, problem("02303"), "02303")))).toThrow(RppError);
  });

  it("normalizes errors of the other layers", () => {
    const aborted = new TransportError("aborted", "Request was aborted");
    expect(toFailure(aborted)).toMatchObject({ kind: "transport", transportKind: "aborted" });
    expect(isAbort(toFailure(aborted))).toBe(true);
    expect(isAbort(toFailure(new TransportError("network", "down")))).toBe(false);
    expect(toFailure(new DiscoveryError("http", "nope", { status: 500, exchangeId: "e" }))).toMatchObject({
      kind: "discovery",
      discoveryKind: "http",
      status: 500,
      exchangeId: "e",
    });
    const cause = new RangeError("boom");
    expect(toFailure(cause)).toMatchObject({ kind: "unknown", message: "boom", cause });
    expect(toFailure("text")).toMatchObject({ kind: "unknown", message: "text" });
    const rpp = new RppError({ kind: "schema-document", message: "bad" });
    expect(toFailure(rpp)).toBe(rpp.failure);
  });
});
