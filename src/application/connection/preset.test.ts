import { describe, expect, it } from "vitest";
import { DEFAULT_PRESET_SETTINGS, type PresetSettings } from "@/config/connectionProfile";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import { createSession } from "./session";
import { resolvePreset } from "./preset";

const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};
const EPP = "urn:ietf:params:rpp:preset:epp-compatible";

const snapshotOf = (presets: unknown[]) =>
  parseDiscoveryDocument(
    {
      "@type": "discovery",
      versions: [{ version: "1.0", baseUrl: "https://rpp.example.test" }],
      environment: { name: "t", status: "s" },
      tlds: ["x"],
      presets,
      objects: ["domainName"],
      datetime: "2026-01-01T00:00:00Z",
    },
    SOURCE,
  ).snapshot;

const two = snapshotOf([
  { id: EPP, version: "1.0", defaultPreset: true, extensions: [] },
  { id: "org.example.rpp.preset.planets", version: "1.1", defaultPreset: false, extensions: [] },
]);

const settings = (overrides: Partial<PresetSettings> = {}): PresetSettings => ({ ...DEFAULT_PRESET_SETTINGS, ...overrides });

describe("resolvePreset", () => {
  it("sends nothing before capabilities are read, or when asked not to", () => {
    expect(resolvePreset(settings(), undefined)).toMatchObject({ preset: undefined, problem: undefined, sent: undefined });
    expect(resolvePreset(settings({ signalling: "none" }), two)).toMatchObject({ preset: undefined, problem: undefined });
  });

  it("follows the default preset of the server", () => {
    const resolved = resolvePreset(settings(), two);
    expect(resolved.preset).toEqual({ method: "header", id: EPP, version: "1.0" });
    expect(resolved.sent).toBe(`RPP-Preset: preset=${EPP};version=1.0`);
    expect(resolved.chosen?.id).toBe(EPP);
  });

  it("uses the chosen preset and the media type method", () => {
    const resolved = resolvePreset(
      settings({ signalling: "media-type", selection: { id: "org.example.rpp.preset.planets", version: "1.1" } }),
      two,
    );
    expect(resolved.preset).toEqual({ method: "media-type", id: "org.example.rpp.preset.planets", version: "1.1" });
    expect(resolved.sent).toBe('Accept and Content-Type: application/rpp+json; preset="org.example.rpp.preset.planets"; preset-version="1.1"');
  });

  it("says why nothing is sent when the server cannot be followed", () => {
    const none = snapshotOf([{ id: EPP, version: "1.0", defaultPreset: false, extensions: [] }]);
    expect(resolvePreset(settings(), none)).toMatchObject({ preset: undefined, problem: expect.stringContaining("exactly one preset") });

    expect(resolvePreset(settings({ selection: { id: "gone", version: "1.0" } }), two)).toMatchObject({
      preset: undefined,
      problem: expect.stringContaining("does not offer gone version 1.0"),
    });

    const integer = snapshotOf([{ id: EPP, version: "1", defaultPreset: true, extensions: [] }]);
    const resolved = resolvePreset(settings(), integer);
    expect(resolved.preset).toBeUndefined();
    expect(resolved.chosen?.version).toBe("1");
    expect(resolved.problem).toContain("decimal");
  });
});

describe("session preset", () => {
  it("is read by the transport for every request after it is set", async () => {
    const seen: (string | null)[] = [];
    const session = createSession(
      { baseUrl: "https://rpp.example.test", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS },
      undefined,
      {
        fetch: async (_url, init) => {
          seen.push(new Headers(init?.headers).get("RPP-Preset"));
          return new Response("{}", { headers: { "Content-Type": "application/rpp+json" } });
        },
      },
    );
    await session.transport.send({ method: "GET", target: "domainNames/x" });
    session.setPreset({ method: "header", id: EPP, version: "1.0" });
    await session.transport.send({ method: "GET", target: "domainNames/x" });
    await session.discovery.discover().catch(() => undefined);
    session.setPreset(undefined);
    await session.transport.send({ method: "GET", target: "domainNames/x" });
    expect(seen).toEqual([null, `preset=${EPP};version=1.0`, null, null]);
  });
});
