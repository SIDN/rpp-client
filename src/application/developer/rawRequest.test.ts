import { describe, expect, it } from "vitest";
import { buildRawRequest, type RawRequestForm } from "./rawRequest";

const FORM: RawRequestForm = { method: "GET", target: "domainNames/example.test", query: "", headers: "", body: "", clientTransactionId: "", authenticate: true };

describe("raw request", () => {
  it("builds the request as typed, with repeated query names and headers", () => {
    const result = buildRawRequest({
      ...FORM,
      method: "POST",
      target: " domainNames ",
      query: "includeElements=authInfo\nincludeElements=dns\nflag",
      headers: "X-Trace: a:b\nAccept-Language:nl",
      body: '{"name":"example.test"}',
      clientTransactionId: "T-1",
      authenticate: false,
    });
    expect(result).toEqual({
      ok: true,
      request: {
        method: "POST",
        target: "domainNames",
        query: { includeElements: ["authInfo", "dns"], flag: "" },
        headers: { "X-Trace": "a:b", "Accept-Language": "nl" },
        body: { name: "example.test" },
        clientTransactionId: "T-1",
        authenticate: false,
      },
    });
  });

  it("sends only the method and target when nothing else is entered", () => {
    expect(buildRawRequest(FORM)).toEqual({ ok: true, request: { method: "GET", target: "domainNames/example.test" } });
  });

  it("names what cannot be sent", () => {
    const result = buildRawRequest({ ...FORM, target: " ", query: "=x", headers: "no colon\nAuthorization: x", body: "{oops", clientTransactionId: "é" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.map((problem) => problem.field).sort()).toEqual(["body", "body", "clientTransactionId", "headers", "headers", "query", "target"]);
  });

  it("refuses a body with GET and HEAD", () => {
    for (const method of ["GET", "HEAD"] as const) {
      const result = buildRawRequest({ ...FORM, method, body: "{}" });
      expect(result).toEqual({ ok: false, problems: [{ field: "body", message: `${method} requests have no body` }] });
    }
  });

  it("keeps a JSON null body", () => {
    expect(buildRawRequest({ ...FORM, method: "PUT", body: "null" })).toMatchObject({ ok: true, request: { body: null } });
  });
});
