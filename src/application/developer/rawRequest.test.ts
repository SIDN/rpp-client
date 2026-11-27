import { describe, expect, it } from "vitest";
import { buildRawRequest, formFromExchange, type RawRequestForm } from "./rawRequest";

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

describe("form from a recorded exchange", () => {
  const BASE = "https://rpp.example.test/rpp";
  const record = {
    method: "POST",
    url: "https://rpp.example.test/rpp/domainNames?flag=1&flag=2&token=%5BREDACTED%5D",
    headers: { accept: "application/rpp+json", authorization: "[REDACTED]", "rpp-cltrid": "T-1", "content-type": "application/rpp+json", "x-trace": "abc" },
    body: '{"name":"example.test","authInfo":"[REDACTED]"}',
  };

  it("gives a path, query lines, the headers the caller may set and a formatted body", () => {
    const { form, hasRedactions } = formFromExchange(record, BASE);
    expect(form).toEqual({
      method: "POST",
      target: "domainNames",
      query: "flag=1\nflag=2\ntoken=[REDACTED]",
      headers: "x-trace: abc",
      body: '{\n  "name": "example.test",\n  "authInfo": "[REDACTED]"\n}',
      clientTransactionId: "",
      authenticate: true,
    });
    expect(hasRedactions).toBe(true);
    expect(buildRawRequest(form)).toMatchObject({ ok: true, request: { method: "POST", target: "domainNames", headers: { "x-trace": "abc" } } });
  });

  it("keeps an address on another origin absolute, and does not authenticate a request that had no credentials", () => {
    const { form, hasRedactions } = formFromExchange({ method: "GET", url: "https://other.example.test/x/y", headers: {}, body: undefined }, BASE);
    expect(form).toMatchObject({ method: "GET", target: "https://other.example.test/x/y", query: "", body: "", authenticate: false });
    expect(hasRedactions).toBe(false);
  });
});
