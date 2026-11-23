import { describe, expect, it, vi } from "vitest";
import { createSession } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import { basicAuthentication } from "./providers/basic";
import { noAuthentication } from "./providers/none";

const context = { method: "GET", url: new URL("https://rpp.example.test/rpp/x") };

describe("authentication providers", () => {
  it("sends nothing without authentication", async () => {
    const provider = noAuthentication();
    expect(provider.state).toEqual({ status: "unauthenticated" });
    expect(await provider.getAuthorizationHeaders(context)).toEqual({});
  });

  it("encodes Basic credentials as UTF-8 (RFC 7617) and reports them as supplied, not verified", async () => {
    const provider = basicAuthentication({ username: "registrar", password: "pässword:1" });
    expect(provider.state).toEqual({ status: "credentials-supplied", method: "basic", principal: "registrar" });
    expect(await provider.getAuthorizationHeaders(context)).toEqual({
      Authorization: `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode("registrar:pässword:1")))}`,
    });
  });

  it("refuses a user name that cannot be encoded and forgets credentials on clearSession", async () => {
    for (const username of ["", "a:b", "a\nb"]) {
      expect(() => basicAuthentication({ username, password: "x" })).toThrow(TypeError);
    }
    expect(() => basicAuthentication({ username: "a", password: "x\u0000" })).toThrow(TypeError);

    const provider = basicAuthentication({ username: "a", password: "b" });
    provider.clearSession();
    await expect(provider.getAuthorizationHeaders(context)).rejects.toThrow("cleared");
  });
});

describe("session", () => {
  const json = () =>
    new Response("{}", { headers: { "Content-Type": "application/rpp+json", "RPP-Code": "01000" } });

  it("sends Basic credentials to operations but not to discovery", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json());
    const session = createSession(
      { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "basic", username: "u" }, preset: DEFAULT_PRESET_SETTINGS },
      { password: "p" },
      { fetch: fetchMock },
    );
    await session.transport.send({ method: "GET", target: "domainNames/x" });
    await session.discovery.discover().catch(() => undefined);
    const header = (index: number) => new Headers(fetchMock.mock.calls[index]?.[1]?.headers).get("Authorization");
    expect(header(0)).toBe(`Basic ${btoa("u:p")}`);
    expect(fetchMock.mock.calls[1]?.[0]?.toString()).toBe("https://rpp.example.test/.well-known/rpp");
    expect(header(1)).toBeNull();
  });

  it("keeps the credentials out of the diagnostics", async () => {
    const session = createSession(
      { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "basic", username: "u" }, preset: DEFAULT_PRESET_SETTINGS },
      { password: "hunter2" },
      { fetch: async () => json() },
    );
    await session.transport.send({ method: "GET", target: "domainNames/x" });
    const logged = JSON.stringify(session.exchanges.entries());
    expect(logged).not.toContain("hunter2");
    expect(logged).not.toContain(btoa("u:hunter2"));
  });

  it("needs a password for Basic, refuses plain HTTP unless allowed, and numbers its sessions", () => {
    const basic = { baseUrl: "https://rpp.example.test", allowInsecureHttp: false, auth: { type: "basic", username: "u" }, preset: DEFAULT_PRESET_SETTINGS } as const;
    expect(() => createSession(basic, undefined)).toThrow("password");
    expect(() => createSession({ baseUrl: "http://localhost:8000", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS }, undefined)).toThrow();
    const none = { baseUrl: "http://localhost:8000", allowInsecureHttp: true, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS } as const;
    expect(createSession(none, undefined).id).toBeLessThan(createSession(none, undefined).id);
  });
});
