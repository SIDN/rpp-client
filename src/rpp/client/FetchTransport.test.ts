import { describe, expect, it, vi } from "vitest";
import { TransportError } from "../errors/TransportError";
import { createExchangeLog } from "./diagnostics";
import { createFetchTransport } from "./FetchTransport";
import type { TransportConfig } from "./RppTransport";

const BASE = "https://rpp.example.test/rpp/v1";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function setup(respond: (input: URL, init: RequestInit) => Response | Promise<Response>, config: Partial<TransportConfig> = {}) {
  const fetchMock: FetchMock = vi.fn<typeof fetch>(async (input, init) => respond(input as URL, init ?? {}));
  const transport = createFetchTransport({ baseUrl: BASE, fetch: fetchMock, ...config });
  const call = () => {
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    return { url: url as URL, init: init as RequestInit, headers: new Headers(init?.headers) };
  };
  return { transport, fetchMock, call };
}

const json = (body: unknown, init: ResponseInit = {}, type = "application/rpp+json") =>
  new Response(JSON.stringify(body), { status: 200, ...init, headers: { "Content-Type": type, ...init.headers } });

async function failure(promise: Promise<unknown>): Promise<TransportError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TransportError);
  return error as TransportError;
}

describe("request construction", () => {
  it("resolves relative targets under the base path and sends negotiation headers", async () => {
    const { transport, call } = setup(() => json({ ok: true }));
    await transport.send({ method: "GET", target: "/domains/example.test", query: { page: 2, skip: undefined } });
    const { url, init, headers } = call();
    expect(url.href).toBe("https://rpp.example.test/rpp/v1/domains/example.test?page=2");
    expect(init.method).toBe("GET");
    expect(headers.get("Accept")).toBe("application/rpp+json");
    expect(headers.has("Content-Type")).toBe(false);
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("manual");
  });

  it("serializes JSON bodies and sets the content type", async () => {
    const { transport, call } = setup(() => json({}, { status: 201 }));
    await transport.send({ method: "POST", target: "domains", body: { name: "example.test" }, clientTransactionId: "ABC-1" });
    const { init, headers } = call();
    expect(init.body).toBe('{"name":"example.test"}');
    expect(headers.get("Content-Type")).toBe("application/rpp+json");
    expect(headers.get("RPP-Cltrid")).toBe("ABC-1");
  });

  it("refuses a body on GET and HEAD, unserializable bodies, owned headers and control characters", async () => {
    const { transport, fetchMock } = setup(() => json({}));
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect((await failure(transport.send({ method: "GET", target: "a", body: {} }))).kind).toBe("invalid-request");
    expect((await failure(transport.send({ method: "POST", target: "a", body: cyclic }))).kind).toBe("invalid-request");
    expect((await failure(transport.send({ method: "GET", target: "a", headers: { authorization: "x" } }))).kind).toBe("invalid-request");
    expect((await failure(transport.send({ method: "GET", target: "a\nb" }))).kind).toBe("invalid-request");
    expect((await failure(transport.send({ method: "GET", target: "../../other" }))).kind).toBe("invalid-request");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("preset signalling", () => {
  const preset = (method: "header" | "media-type") => ({ method, id: "urn:ietf:params:rpp:preset:epp-compatible", version: "1.0" }) as const;

  it("uses the RPP-Preset header", async () => {
    const { transport, call } = setup(() => json({}), { preset: preset("header") });
    await transport.send({ method: "POST", target: "domains", body: {} });
    const { headers } = call();
    expect(headers.get("RPP-Preset")).toBe("preset=urn:ietf:params:rpp:preset:epp-compatible;version=1.0");
    expect(headers.get("Content-Type")).toBe("application/rpp+json");
  });

  it("uses media type parameters, also on a request without content", async () => {
    const { transport, call } = setup(() => json({}), { preset: preset("media-type") });
    await transport.send({ method: "GET", target: "domains/x" });
    const { headers } = call();
    const expected = 'application/rpp+json; preset="urn:ietf:params:rpp:preset:epp-compatible"; preset-version="1.0"';
    expect(headers.get("Accept")).toBe(expected);
    expect(headers.get("Content-Type")).toBe(expected);
    expect(headers.has("RPP-Preset")).toBe(false);
  });

  it("lets a request drop the configured preset and rejects malformed presets", async () => {
    const { transport, call } = setup(() => json({}), { preset: preset("header") });
    await transport.send({ method: "GET", target: "a", preset: null });
    expect(call().headers.has("RPP-Preset")).toBe(false);
    const bad = await failure(transport.send({ method: "GET", target: "a", preset: { method: "header", id: "a b", version: "1" } }));
    expect(bad.kind).toBe("invalid-request");
  });

  it("asks a configured preset function for every request", async () => {
    let current: ReturnType<typeof preset> | undefined;
    const { transport, fetchMock } = setup(() => json({}), { preset: () => current });
    await transport.send({ method: "GET", target: "a" });
    current = preset("header");
    await transport.send({ method: "GET", target: "a" });
    const sent = (index: number) => new Headers(fetchMock.mock.calls[index]?.[1]?.headers).get("RPP-Preset");
    expect(sent(0)).toBeNull();
    expect(sent(1)).toBe("preset=urn:ietf:params:rpp:preset:epp-compatible;version=1.0");
  });
});

describe("responses", () => {
  it("parses JSON, including problem details, for any status", async () => {
    const { transport } = setup(() =>
      json({ title: "Nope" }, { status: 404, headers: { "RPP-Code": "02303", "RPP-Svtrid": "S-1", "RPP-Cltrid": "C-1" } }, "application/problem+json"),
    );
    const response = await transport.send({ method: "GET", target: "domains/x" });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ kind: "json", value: { title: "Nope" }, mediaType: "application/problem+json" });
    expect(response.correlation).toEqual({ clientTransactionId: "C-1", serverTransactionId: "S-1", resultCode: "02303" });
  });

  it("reports empty bodies for HEAD, 204 and zero-length content", async () => {
    const heads = setup(() => new Response(null, { status: 200 }));
    expect((await heads.transport.send({ method: "HEAD", target: "a" })).body).toEqual({ kind: "empty" });
    const none = setup(() => new Response(null, { status: 204 }));
    expect((await none.transport.send({ method: "DELETE", target: "a" })).body).toEqual({ kind: "empty" });
    const blank = setup(() => new Response("", { status: 200, headers: { "Content-Type": "application/rpp+json" } }));
    expect((await blank.transport.send({ method: "GET", target: "a" })).body).toEqual({ kind: "empty" });
  });

  it("keeps the raw text of malformed JSON", async () => {
    const { transport } = setup(() => new Response("{oops", { headers: { "Content-Type": "application/rpp+json" } }));
    const { body } = await transport.send({ method: "GET", target: "a" });
    expect(body).toMatchObject({ kind: "malformed-json", text: "{oops" });
  });

  it("does not parse unexpected or missing media types", async () => {
    const html = setup(() => new Response("<p>x</p>", { headers: { "Content-Type": "text/html" } }));
    expect((await html.transport.send({ method: "GET", target: "a" })).body).toEqual({
      kind: "unexpected-media-type",
      text: "<p>x</p>",
      mediaType: "text/html",
    });
    const plain = setup(() => json({}, {}, "application/json"));
    expect((await plain.transport.send({ method: "GET", target: "a" })).body.kind).toBe("unexpected-media-type");
    const accepted = setup(() => json({}, {}, "application/json"));
    const response = await accepted.transport.send({ method: "GET", target: "a", accept: ["application/json"] });
    expect(response.body.kind).toBe("json");
  });
});

describe("origin policy", () => {
  it("refuses absolute targets on other origins and plain HTTP", async () => {
    const { transport, fetchMock } = setup(() => json({}));
    expect((await failure(transport.send({ method: "GET", target: "https://evil.test/x" }))).kind).toBe("origin-not-allowed");
    expect((await failure(transport.send({ method: "GET", target: "//evil.test/x" }))).kind).toBe("origin-not-allowed");
    expect((await failure(transport.send({ method: "GET", target: "http://rpp.example.test/x" }))).kind).toBe("origin-not-allowed");
    expect((await failure(transport.send({ method: "GET", target: "https://user:pw@rpp.example.test/x" }))).kind).toBe("origin-not-allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts server links on allowed origins and http only in development configuration", async () => {
    const other = setup(() => json({}), { allowedOrigins: ["https://other.example.test"] });
    await other.transport.send({ method: "GET", target: "https://other.example.test/page/2" });
    expect(other.call().url.href).toBe("https://other.example.test/page/2");

    const dev = setup(() => json({}), { baseUrl: "http://localhost:8080", allowInsecureHttp: true });
    await dev.transport.send({ method: "GET", target: "domains" });
    expect(dev.call().url.href).toBe("http://localhost:8080/domains");
    expect(() => createFetchTransport({ baseUrl: "http://localhost:8080" })).toThrow(TransportError);
  });

  it("sends authorization headers to the base origin only", async () => {
    const authorizationHeaders = vi.fn(async () => ({ Authorization: "Bearer secret-token" }));
    const { transport, fetchMock } = setup(() => json({}), {
      authorizationHeaders,
      allowedOrigins: ["https://other.example.test"],
    });
    await transport.send({ method: "GET", target: "a" });
    await transport.send({ method: "GET", target: "https://other.example.test/b" });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe("Bearer secret-token");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).has("Authorization")).toBe(false);
    expect(authorizationHeaders).toHaveBeenCalledTimes(1);
  });

  it("reports a failing authorization source", async () => {
    const { transport } = setup(() => json({}), {
      authorizationHeaders: async () => {
        throw new Error("expired");
      },
    });
    expect((await failure(transport.send({ method: "GET", target: "a" }))).kind).toBe("authentication");
  });
});

describe("redirects", () => {
  it("rejects redirects by default", async () => {
    const { transport } = setup(() => new Response(null, { status: 302, headers: { Location: "https://evil.test/x?token=abc" } }));
    const error = await failure(transport.send({ method: "GET", target: "a" }));
    expect(error.kind).toBe("redirect-blocked");
    expect(error.message).toContain("evil.test");
    expect(error.message).not.toContain("abc");
  });

  it("does not treat 304 as a redirect", async () => {
    const { transport } = setup(() => new Response(null, { status: 304 }));
    expect((await transport.send({ method: "GET", target: "a" })).status).toBe(304);
  });

  function redirected(url: string): Response {
    const response = json({});
    Object.defineProperty(response, "redirected", { value: true });
    Object.defineProperty(response, "url", { value: url });
    return response;
  }

  it("follows redirects to allowed origins when configured", async () => {
    const { transport, call } = setup(() => redirected("https://rpp.example.test/rpp/v1/moved"), { redirectPolicy: "follow-allowed" });
    const response = await transport.send({ method: "GET", target: "a" });
    expect(call().init.redirect).toBe("follow");
    expect(response).toMatchObject({ redirected: true, url: "https://rpp.example.test/rpp/v1/moved" });
  });

  it("refuses a followed redirect that ended on another origin", async () => {
    const { transport } = setup(() => redirected("https://evil.test/x"), { redirectPolicy: "follow-allowed" });
    expect((await failure(transport.send({ method: "GET", target: "a" }))).kind).toBe("origin-not-allowed");
  });
});

const hang = (_: URL, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) reject(signal.reason);
    else signal?.addEventListener("abort", () => reject(signal.reason));
  });

describe("failures, cancellation and timeouts", () => {
  it("wraps network failures", async () => {
    const { transport } = setup(() => Promise.reject(new TypeError("Failed to fetch")));
    const error = await failure(transport.send({ method: "GET", target: "a" }));
    expect(error.kind).toBe("network");
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it("aborts through the caller's signal, also before the request starts", async () => {
    const { transport } = setup(hang);
    const controller = new AbortController();
    const pending = failure(transport.send({ method: "GET", target: "a", signal: controller.signal }));
    controller.abort();
    expect((await pending).kind).toBe("aborted");

    const already = AbortSignal.abort();
    expect((await failure(transport.send({ method: "GET", target: "a", signal: already }))).kind).toBe("aborted");
  });

  it("times out", async () => {
    const { transport } = setup(hang, { timeoutMs: 10 });
    expect((await failure(transport.send({ method: "GET", target: "a" }))).kind).toBe("timeout");
  });
});

describe("diagnostics", () => {
  it("records redacted exchanges", async () => {
    const log = createExchangeLog();
    const { transport } = setup(
      () => json({ authInfo: "response-secret", name: "x" }, { headers: { "Set-Cookie": "sid=1", "X-Trace": "t" } }),
      { onExchange: log.record, authorizationHeaders: async () => ({ Authorization: "Bearer secret-token" }) },
    );
    await transport.send({ method: "POST", target: "domains", query: { access_token: "q-secret" }, body: { password: "body-secret", name: "x" } });
    const [entry] = log.entries();
    const serialized = JSON.stringify(entry);
    for (const secret of ["secret-token", "q-secret", "body-secret", "response-secret", "sid=1"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(entry?.request.headers.authorization).toBe("[REDACTED]");
    expect(entry?.outcome).toMatchObject({ kind: "response", status: 200 });
    expect(entry?.outcome.kind === "response" && entry.outcome.headers["x-trace"]).toBe("t");
  });

  it("records failures and survives a throwing listener", async () => {
    const onExchange = vi.fn(() => {
      throw new Error("listener");
    });
    const { transport } = setup(() => Promise.reject(new TypeError("down")), { onExchange });
    const error = await failure(transport.send({ method: "GET", target: "a" }));
    expect(error.exchange?.outcome).toMatchObject({ kind: "error", errorKind: "network" });
    expect(onExchange).toHaveBeenCalledTimes(1);
  });

  it("bounds the stored body and the log", async () => {
    const log = createExchangeLog(2);
    const { transport } = setup(() => new Response("x".repeat(50), { headers: { "Content-Type": "text/plain" } }), {
      onExchange: log.record,
      maxDiagnosticBodyChars: 10,
    });
    for (let i = 0; i < 3; i++) await transport.send({ method: "GET", target: "a" });
    expect(log.entries()).toHaveLength(2);
    expect(log.entries()[0]?.outcome).toMatchObject({ body: "x".repeat(10), bodyTruncated: true });
  });
});
