import { describe, expect, it } from "vitest";
import { buildRawRequest, formFromRequest, holdsRedactedValue, type RawRequestForm } from "./rawRequest";

const FORM: RawRequestForm = { method: "GET", target: "domainNames/example.test", query: "", headers: "", body: "", clientTransactionId: "", authenticate: true, setStandardHeaders: false, standardHeaders: "" };

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

  it("sends standard headers only when switched on, and only headers the client owns", () => {
    const standardHeaders = "Accept: application/json\nAuthorization: Bearer typed\nRPP-Cltrid: H-1";
    expect(buildRawRequest({ ...FORM, standardHeaders })).toEqual({ ok: true, request: { method: "GET", target: "domainNames/example.test" } });
    expect(buildRawRequest({ ...FORM, standardHeaders, setStandardHeaders: true, headers: "X-Trace: t" })).toEqual({
      ok: true,
      request: {
        method: "GET",
        target: "domainNames/example.test",
        headers: { "X-Trace": "t" },
        headerOverrides: { Accept: "application/json", Authorization: "Bearer typed", "RPP-Cltrid": "H-1" },
      },
    });
    expect(buildRawRequest({ ...FORM, setStandardHeaders: true, standardHeaders: "X-Trace: t" })).toEqual({
      ok: false,
      problems: [{ field: "standardHeaders", message: "X-Trace is not a header the client sets; put it under Extra headers" }],
    });
    expect(buildRawRequest({ ...FORM, setStandardHeaders: true, standardHeaders: "RPP-Cltrid: H-1", clientTransactionId: "F-1" })).toMatchObject({
      ok: false,
      problems: [{ field: "standardHeaders" }],
    });
    expect(buildRawRequest({ ...FORM, headers: "Accept: application/json" })).toMatchObject({ ok: false, problems: [{ field: "headers" }] });
  });

  describe("filled in from a recorded request", () => {
    const BASE = "https://rpp.example.test/rpp";

    it("keeps every value as recorded, redacted ones included", () => {
      const form = formFromRequest(
        {
          method: "POST",
          url: "https://rpp.example.test/rpp/domainNames/a.example/transfer?token=%5BREDACTED%5D&x=1&x=2",
          headers: {
            accept: "application/rpp+json",
            "content-type": "application/rpp+json",
            "rpp-cltrid": "T-7",
            authorization: "[REDACTED]",
            "x-api-key": "[REDACTED]",
            "x-trace": "t1",
          },
          body: '{"authInfo":"[REDACTED]","period":1}',
        },
        BASE,
      );
      expect(form).toEqual({
        method: "POST",
        target: "domainNames/a.example/transfer",
        query: "token=[REDACTED]\nx=1\nx=2",
        headers: "x-api-key: [REDACTED]\nx-trace: t1",
        setStandardHeaders: true,
        standardHeaders: "accept: application/rpp+json\ncontent-type: application/rpp+json",
        body: '{"authInfo":"[REDACTED]","period":1}',
        clientTransactionId: "T-7",
        authenticate: true,
      });
      expect(form && holdsRedactedValue(form)).toBe(true);
    });

    it("leaves credentials off when the recorded request had none, and keeps addresses outside the base absolute", () => {
      const form = formFromRequest({ method: "GET", url: "https://other.example.test/rpp/x", headers: { "rpp-cltrid": "T-8" }, body: undefined }, BASE);
      expect(form).toEqual({ ...FORM, target: "https://other.example.test/rpp/x", clientTransactionId: "T-8", authenticate: false });
      expect(form && holdsRedactedValue(form)).toBe(false);
      expect(formFromRequest({ method: "GET", url: "https://rpp.example.test/rpp/", headers: {}, body: undefined }, BASE)?.target).toBe("https://rpp.example.test/rpp/");
    });

    it("builds the same request again from the filled-in form", () => {
      const form = formFromRequest({ method: "PUT", url: `${BASE}/hosts/ns1?a=1`, headers: { "x-trace": "t" }, body: '{"name":"ns1"}' }, BASE);
      if (!form) throw new Error("expected a form");
      expect(buildRawRequest(form)).toEqual({
        ok: true,
        request: { method: "PUT", target: "hosts/ns1", query: { a: "1" }, headers: { "x-trace": "t" }, body: { name: "ns1" }, authenticate: false },
      });
    });

    it("cannot fill in a request without a resolved address or with an unknown method", () => {
      expect(formFromRequest({ method: "GET", url: "(unresolved)", headers: {}, body: undefined }, BASE)).toBeUndefined();
      expect(formFromRequest({ method: "TRACE", url: `${BASE}/x`, headers: {}, body: undefined }, BASE)).toBeUndefined();
    });
  });
});
