import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "../client/FetchTransport";
import { DiscoveryError } from "../errors/DiscoveryError";
import {
  advertisedExtensions,
  defaultPreset,
  extensionsOfPreset,
  findVersion,
  supportsObject,
} from "./capabilities";
import { createDiscoveryService } from "./DiscoveryService";
import { detectExtensions } from "./extensionDetection";
import { parseDiscoveryDocument } from "./parseDiscoveryDocument";

const BASE = "https://rpp.example.test/rpp/v1";
const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};

const planets = { "@type": "extension", id: "org.example.rpp.ext.planets", name: "Planets", version: "1.0", url: "https://example.test/planets" };
const epp = { "@type": "extension", id: "urn:ietf:params:rpp:ext:epp", name: "EPP", version: "1.0", url: "https://example.test/epp" };

function document(overrides: Record<string, unknown> = {}) {
  return {
    "@type": "discovery",
    versions: [{ "@type": "discoveryVersion", version: "1.0", baseUrl: BASE }],
    environment: { "@type": "discoveryEnvironment", name: "test", status: "stable" },
    tlds: ["example"],
    extensions: [epp, planets],
    presets: [
      { "@type": "preset", id: "urn:ietf:params:rpp:preset:epp-compatible", version: "1.0", name: "EPP", description: "d", rppVersion: "1.0", defaultPreset: true, extensions: [epp], profiles: [], boundProfiles: [] },
      { "@type": "preset", id: "org.example.rpp.preset.planets", version: "1.1", name: "P", description: "d", rppVersion: "1.0", defaultPreset: false, extensions: [epp, planets], profiles: [], boundProfiles: [] },
    ],
    profiles: [{ "@type": "profile", id: "urn:ietf:params:rpp:profile:base", version: "1.0" }],
    objects: ["domainName", "host", "contact"],
    datetime: "2026-01-01T00:00:00Z",
    links: [{ label: "tos", object: "x" }],
    ...overrides,
  };
}

function service(respond: () => Response, fetchMock = vi.fn<typeof fetch>(async () => respond())) {
  const transport = createFetchTransport({ baseUrl: BASE, fetch: fetchMock });
  return { fetchMock, discovery: createDiscoveryService({ transport, baseUrl: BASE }) };
}

const rppJson = (body: unknown, status = 200, type = "application/rpp+json") =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": type } });

describe("parseDiscoveryDocument", () => {
  it("reads a complete document without warnings and keeps the raw document", () => {
    const raw = document();
    const { snapshot, warnings } = parseDiscoveryDocument(raw, SOURCE);
    expect(warnings).toEqual([]);
    expect(snapshot.versions).toEqual([{ version: "1.0", baseUrl: BASE }]);
    expect(snapshot.environment).toEqual({ name: "test", status: "stable" });
    expect(snapshot.presets).toHaveLength(2);
    expect(snapshot.presets[0]).toMatchObject({ isDefault: true, extensions: [{ id: epp.id, version: "1.0" }] });
    expect(snapshot.raw).toBe(raw);
    expect(snapshot.source).toBe(SOURCE);
  });

  it("rejects anything but a JSON object", () => {
    for (const value of [[], "x", null, 3]) {
      expect(() => parseDiscoveryDocument(value, SOURCE)).toThrow(DiscoveryError);
    }
  });

  it("warns about and skips unusable entries instead of failing", () => {
    const { snapshot, warnings } = parseDiscoveryDocument(
      document({
        versions: [{ version: "1.0" }, { version: "2.0", baseUrl: "http://rpp.example.test" }],
        extensions: [{ id: "a" }, epp, epp],
        presets: "nope",
        datetime: "yesterday",
      }),
      SOURCE,
    );
    expect(snapshot.versions).toEqual([{ version: "2.0", baseUrl: "http://rpp.example.test" }]);
    expect(snapshot.extensions).toHaveLength(1);
    expect(snapshot.presets).toEqual([]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/versions/0"),
        expect.stringContaining("/versions/1/baseUrl: not an https URL"),
        expect.stringContaining("/extensions/0"),
        expect.stringContaining("listed more than once"),
        expect.stringContaining("/presets: expected an array"),
        expect.stringContaining("/datetime"),
      ]),
    );
  });

  it("warns about default preset and extension list inconsistencies", () => {
    const { snapshot, warnings } = parseDiscoveryDocument(
      document({ extensions: [epp], presets: [
        { id: "a", version: "1.0", defaultPreset: false, extensions: [planets] },
        { id: "b", version: "1.0", defaultPreset: false, extensions: [] },
      ] }),
      SOURCE,
    );
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("exactly one preset must be the default"),
        expect.stringContaining(`${planets.id}@1.0 is not in the extensions list`),
      ]),
    );
    expect(defaultPreset(snapshot)).toBeUndefined();
    expect(advertisedExtensions(snapshot).map((extension) => extension.id)).toEqual([epp.id, planets.id]);
  });
});

describe("capability queries", () => {
  const { snapshot } = parseDiscoveryDocument(document(), SOURCE);

  it("answers from the snapshot only", () => {
    expect(defaultPreset(snapshot)?.id).toBe("urn:ietf:params:rpp:preset:epp-compatible");
    expect(extensionsOfPreset(snapshot)?.map((extension) => extension.id)).toEqual([epp.id]);
    expect(extensionsOfPreset(snapshot, { id: "org.example.rpp.preset.planets", version: "1.1" })).toHaveLength(2);
    expect(extensionsOfPreset(snapshot, { id: "org.example.rpp.preset.planets", version: "1.0" })).toBeUndefined();
    expect(supportsObject(snapshot, "domainName")).toBe(true);
    expect(supportsObject(snapshot, "organisation")).toBe(false);
    expect(findVersion(snapshot, "1.0")?.baseUrl).toBe(BASE);
    expect(findVersion(snapshot, "9.9")).toBeUndefined();
  });
});

describe("extension detection", () => {
  const { snapshot } = parseDiscoveryDocument(document(), SOURCE);

  it("separates available, version-mismatched and unrecognized extensions", () => {
    const detection = detectExtensions(advertisedExtensions(snapshot), [
      { id: epp.id, supportedVersions: ["1.0"] },
      { id: planets.id, supportedVersions: ["0.9"] },
      { id: "org.example.local-only", supportedVersions: ["1.0"] },
    ]);
    expect(detection.advertised.map((entry) => entry.status)).toEqual(["available", "version-mismatch"]);
    expect(detection.notAdvertised).toEqual([{ id: "org.example.local-only", supportedVersions: ["1.0"] }]);

    const none = detectExtensions(advertisedExtensions(snapshot), []);
    expect(none.advertised.map((entry) => entry.status)).toEqual(["unrecognized", "unrecognized"]);
  });
});

describe("DiscoveryService", () => {
  it("requests the well-known URL at the origin root without a preset or authorization", async () => {
    const { discovery, fetchMock } = service(() => rppJson(document()));
    const result = await discovery.discover();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect((url as URL).href).toBe("https://rpp.example.test/.well-known/rpp");
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).has("RPP-Preset")).toBe(false);
    expect(result.status).toBe("ready");
    expect(result.snapshot.source.url).toBe("https://rpp.example.test/.well-known/rpp");
    expect(result.snapshot.source.exchangeId).toMatch(/\w/);
  });

  it("is partial with warnings when the document has problems", async () => {
    const { discovery } = service(() => rppJson(document({ presets: [] })));
    const result = await discovery.discover();
    expect(result.status).toBe("partial");
    expect(result.status === "partial" && result.warnings.length).toBeGreaterThan(0);
  });

  it("fails visibly, never as unrestricted support", async () => {
    const problem = service(() => rppJson({ title: "Command failed" }, 500, "application/problem+json"));
    const http = await problem.discovery.discover().catch((e: unknown) => e);
    expect(http).toBeInstanceOf(DiscoveryError);
    expect(http).toMatchObject({ kind: "http", status: 500 });
    expect((http as DiscoveryError).message).toContain("Command failed");

    const html = service(() => new Response("<p>", { headers: { "Content-Type": "text/html" } }));
    expect(await html.discovery.discover().catch((e: unknown) => e)).toMatchObject({ kind: "content" });

    const notDocument = service(() => rppJson([1]));
    expect(await notDocument.discovery.discover().catch((e: unknown) => e)).toMatchObject({ kind: "invalid-document" });

    const down = service(() => {
      throw new TypeError("offline");
    });
    const network = await down.discovery.discover().catch((e: unknown) => e);
    expect(network).toMatchObject({ kind: "transport" });
    expect((network as DiscoveryError).exchangeId).toBeDefined();
  });

  it("passes cancellation through unchanged", async () => {
    const hang = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) reject(signal.reason);
          else signal?.addEventListener("abort", () => reject(signal.reason));
        }),
    );
    const { discovery } = service(() => rppJson({}), hang);
    const controller = new AbortController();
    const pending = discovery.discover({ signal: controller.signal }).catch((e: unknown) => e);
    controller.abort();
    expect(await pending).toMatchObject({ name: "TransportError", kind: "aborted" });
  });

  it("refuses a discovery URL on another origin", async () => {
    const transport = createFetchTransport({ baseUrl: BASE, fetch: vi.fn<typeof fetch>() });
    const discovery = createDiscoveryService({ transport, baseUrl: BASE, discoveryUrl: "https://evil.test/.well-known/rpp" });
    expect(await discovery.discover().catch((e: unknown) => e)).toMatchObject({ kind: "transport" });
  });
});
