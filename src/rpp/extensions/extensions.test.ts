import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "../client/FetchTransport";
import { parseDiscoveryDocument } from "../discovery/parseDiscoveryDocument";
import { detectExtensions } from "../discovery/extensionDetection";
import { advertisedExtensions } from "../discovery/capabilities";
import { RppError } from "../errors/RppError";
import { createRppClient, type RppClientConfig } from "../operations/RppClient";
import { createSchemaRegistry, JSON_SCHEMA_2020_12 } from "../schemas/SchemaRegistry";
import { activationOf, BUNDLED_EXTENSIONS, extensionObjectTypes, findExtensionModule } from "./ExtensionRegistry";
import { checkUriTemplate, DENIC_RRI, expandUriTemplate, requestContactOperations } from "./modules/denicRri";

const BASE = "https://rpp.example.test/rpp";
const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};

const RRI = { "@type": "extension", id: "de.denic.rpp.rri", name: "DENIC RRI", version: "0.2.0", url: DENIC_RRI.schemaId };
const BASE_PRESET = { "@type": "preset", id: "urn:ietf:params:rpp:preset:base", version: "1.0", defaultPreset: true, extensions: [] };
const RRI_PRESET = { "@type": "preset", id: "de.denic.rpp.preset.rri", version: "1.0", defaultPreset: false, extensions: [RRI] };

function snapshotOf(overrides: Record<string, unknown> = {}) {
  return parseDiscoveryDocument(
    {
      "@type": "discovery",
      versions: [{ "@type": "discoveryVersion", version: "1.0", baseUrl: BASE }],
      tlds: ["de"],
      objects: ["domainName", "contact", "requestContact"],
      extensions: [RRI],
      presets: [BASE_PRESET, RRI_PRESET],
      ...overrides,
    },
    SOURCE,
  ).snapshot;
}

describe("extension activation", () => {
  it("bundles the DENIC RRI module under its protocol identifier", () => {
    expect(findExtensionModule("de.denic.rpp.rri")).toBe(DENIC_RRI);
    expect(BUNDLED_EXTENSIONS.map((module) => module.id)).toEqual(["de.denic.rpp.rri"]);
    expect(findExtensionModule("rri")).toBeUndefined();
  });

  it("is active under the preset that carries the extension", () => {
    const snapshot = snapshotOf();
    expect(activationOf(DENIC_RRI, snapshot, { id: "de.denic.rpp.preset.rri", version: "1.0" })).toMatchObject({
      status: "active",
      advertised: { id: "de.denic.rpp.rri", version: "0.2.0" },
    });
  });

  it("is not active under a preset without it, nor under the default preset when that lacks it", () => {
    const snapshot = snapshotOf();
    expect(activationOf(DENIC_RRI, snapshot, { id: "urn:ietf:params:rpp:preset:base", version: "1.0" })).toMatchObject({
      status: "not-in-preset",
      preset: { id: "urn:ietf:params:rpp:preset:base", version: "1.0" },
    });
    expect(activationOf(DENIC_RRI, snapshot)).toMatchObject({ status: "not-in-preset", preset: { id: "urn:ietf:params:rpp:preset:base" } });
    const rriDefault = snapshotOf({ presets: [{ ...BASE_PRESET, defaultPreset: false }, { ...RRI_PRESET, defaultPreset: true }] });
    expect(activationOf(DENIC_RRI, rriDefault).status).toBe("active");
  });

  it("does not activate a module only because it is bundled", () => {
    const snapshot = snapshotOf({ extensions: [], presets: [BASE_PRESET] });
    expect(activationOf(DENIC_RRI, snapshot)).toEqual({ status: "not-advertised" });
    expect(extensionObjectTypes(snapshot).size).toBe(0);
  });

  it("matches the version exactly", () => {
    const other = { ...RRI, version: "0.1.0" };
    const snapshot = snapshotOf({ extensions: [other], presets: [{ ...RRI_PRESET, extensions: [other], defaultPreset: true }] });
    expect(activationOf(DENIC_RRI, snapshot)).toMatchObject({ status: "version-mismatch", supportedVersions: ["0.2.0"] });
    expect(detectExtensions(advertisedExtensions(snapshot), BUNDLED_EXTENSIONS).advertised[0]?.status).toBe("version-mismatch");
  });

  it("uses the extensions list of a server without presets", () => {
    expect(activationOf(DENIC_RRI, snapshotOf({ presets: [] })).status).toBe("active");
  });

  it("names the objects of active modules only", () => {
    const snapshot = snapshotOf();
    expect([...extensionObjectTypes(snapshot, { id: "de.denic.rpp.preset.rri", version: "1.0" }).keys()]).toEqual(["requestContact"]);
    expect(extensionObjectTypes(snapshot).size).toBe(0);
  });

  it("keeps unknown advertised extensions visible as unrecognized", () => {
    const unknown = { "@type": "extension", id: "org.example.unknown", version: "1.0" };
    const snapshot = snapshotOf({ extensions: [RRI, unknown] });
    expect(detectExtensions(advertisedExtensions(snapshot), BUNDLED_EXTENSIONS).advertised.map((entry) => entry.status)).toEqual([
      "available",
      "unrecognized",
    ]);
  });
});

type Responder = (url: URL, init: RequestInit, headers: Headers) => Response;

function setup(respond: Responder, config: Partial<RppClientConfig> = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => respond(input as URL, init ?? {}, new Headers(init?.headers)));
  const client = createRppClient({ transport: createFetchTransport({ baseUrl: BASE, fetch: fetchMock }), ...config });
  const call = (index = 0) => {
    const [url, init] = fetchMock.mock.calls[index] ?? [];
    return { url: url as URL, init: init as RequestInit, headers: new Headers(init?.headers), body: init?.body as string | undefined };
  };
  return { requestContacts: client.extension(requestContactOperations), client, fetchMock, call };
}

function reply(headers: Headers, status: number, body?: unknown, extra: Record<string, string> = {}, type = "application/rpp+json") {
  return new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": type }),
      "RPP-Cltrid": headers.get("RPP-Cltrid") ?? "",
      "RPP-Svtrid": "S-1",
      "RPP-Code": status < 300 ? "01000" : "02101",
      ...extra,
    },
  });
}

async function failure(promise: Promise<unknown>): Promise<RppError> {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(RppError);
  return error as RppError;
}

const TEMPLATE = "https://www.example.com/contact?domain={Alabel}";
const STORED = {
  "@type": "requestContact",
  id: "DENIC-1000022-GR",
  provMetadata: { "@type": "provMetadata", spClientId: "DENIC-1000022", upDate: "2026-11-12T00:20:20.0Z" },
  uriTemplate: TEMPLATE,
};

describe("request contact operations", () => {
  it("are built once per client from the context of the core operations", () => {
    const { client, requestContacts } = setup((_u, _i, h) => reply(h, 200, STORED));
    expect(client.extension(requestContactOperations)).toBe(requestContacts);
    expect("delete" in requestContacts).toBe(false);
  });

  it("create with POST /requestContacts and the request contact as body", async () => {
    const { requestContacts, call } = setup((_u, _i, h) => reply(h, 201, STORED, { Location: `${BASE}/requestContacts/DENIC-1000022-GR` }));
    const result = await requestContacts.create({ "@type": "requestContact", id: "DENIC-1000022-GR", uriTemplate: TEMPLATE });
    const { url, init, headers, body } = call();
    expect(`${init.method} ${url.pathname}`).toBe("POST /rpp/requestContacts");
    expect(headers.get("Content-Type")).toBe("application/rpp+json");
    expect(headers.get("Accept")).toContain("application/rpp+json");
    expect(headers.get("RPP-Cltrid")).toMatch(/\w+/);
    expect(JSON.parse(body ?? "")).toEqual({ "@type": "requestContact", id: "DENIC-1000022-GR", uriTemplate: TEMPLATE });
    expect(result.data).toEqual(STORED);
    expect(result.meta).toMatchObject({ status: 201, location: `${BASE}/requestContacts/DENIC-1000022-GR`, warnings: [] });
  });

  it("accept a create that was applied without a read back (202, no body)", async () => {
    const { requestContacts } = setup((_u, _i, h) => reply(h, 202, undefined, { "RPP-Code": "01001" }));
    const result = await requestContacts.create({ "@type": "requestContact", id: "DENIC-1000022-GR", uriTemplate: TEMPLATE });
    expect(result.data).toBeUndefined();
    expect(result.meta.status).toBe(202);
  });

  it("read with GET, keeping members this client does not model", async () => {
    const extra = { ...STORED, future: { x: 1 } };
    const { requestContacts, call } = setup((_u, _i, h) => reply(h, 200, extra));
    const result = await requestContacts.read("DENIC-1000022-GR");
    expect(`${call().init.method} ${call().url.pathname}`).toBe("GET /rpp/requestContacts/DENIC-1000022-GR");
    expect(call().init.body).toBeUndefined();
    expect(result.data.future).toEqual({ x: 1 });
  });

  it("warn when the server answers with another object type", async () => {
    const { requestContacts } = setup((_u, _i, h) => reply(h, 200, { "@type": "contact", id: "DENIC-1000022-GR" }));
    expect((await requestContacts.read("DENIC-1000022-GR")).meta.warnings).toEqual([expect.stringContaining("of type contact, expected requestContact")]);
  });

  it("update the template with PUT or with a JSON Patch", async () => {
    const { requestContacts, call } = setup((_u, _i, h) => reply(h, 200, STORED));
    await requestContacts.replace("DENIC-1000022-GR", { "@type": "requestContact", uriTemplate: "mailto:abuse@example.com" });
    await requestContacts.patch("DENIC-1000022-GR", [{ op: "replace", path: "/uriTemplate", value: "https://www.example.com/abuse/{Ulabel}" }]);
    expect(`${call().init.method} ${call().url.pathname}`).toBe("PUT /rpp/requestContacts/DENIC-1000022-GR");
    expect(JSON.parse(call().body ?? "")).toEqual({ "@type": "requestContact", uriTemplate: "mailto:abuse@example.com" });
    expect(call(1).init.method).toBe("PATCH");
    expect(JSON.parse(call(1).body ?? "")).toEqual([{ op: "replace", path: "/uriTemplate", value: "https://www.example.com/abuse/{Ulabel}" }]);
  });

  it("check availability with GET or HEAD, a 404 being an answer", async () => {
    const taken = { "@type": "requestContactAvailability", available: false, reason: "In use" };
    const get = setup((_u, _i, h) => reply(h, 404, taken));
    const answer = await get.requestContacts.availability("DENIC-1000022-GR");
    expect(get.call().url.pathname).toBe("/rpp/requestContacts/DENIC-1000022-GR/availability");
    expect(answer).toMatchObject({ available: false, details: taken, meta: { warnings: [] } });

    const head = setup((_u, _i, h) => reply(h, 200, undefined));
    expect(await head.requestContacts.availability("DENIC-1000022-GR", { method: "HEAD" })).toMatchObject({ available: true, details: undefined });
    expect(head.call().init.method).toBe("HEAD");

    const contradicting = setup((_u, _i, h) => reply(h, 200, { "@type": "requestContactAvailability", available: false }));
    expect((await contradicting.requestContacts.availability("X-1")).meta.warnings).toEqual([expect.stringContaining("contradicts")]);
  });

  it("keep the problem of a refusal, such as the template the registry refused", async () => {
    const problem = { type: "urn:ietf:params:rpp:error", title: "Bad template", errors: [{ type: "t", result: "02005", reason: "83000000005 template refused" }] };
    const { requestContacts } = setup((_u, _i, h) => reply(h, 400, problem, { "RPP-Code": "02005" }, "application/problem+json"));
    const error = await failure(requestContacts.create({ "@type": "requestContact", id: "DENIC-1000022-GR", uriTemplate: "ftp://x.example/" }));
    expect(error.failure).toMatchObject({ kind: "rpp-protocol", status: 400, resultCode: { raw: "02005" } });
  });

  it("report malformed JSON and unexpected content types", async () => {
    const broken = setup((_u, _i, h) => reply(h, 200, "{not json"));
    expect((await failure(broken.requestContacts.read("X-1"))).failure).toMatchObject({ kind: "content", reason: "malformed-json" });
    const html = setup((_u, _i, h) => reply(h, 200, "<html></html>", {}, "text/html"));
    expect((await failure(html.requestContacts.read("X-1"))).failure).toMatchObject({ kind: "content", reason: "unexpected-media-type" });
  });

  it("refuse identifiers that would change the path, without sending", async () => {
    const { requestContacts, fetchMock, call } = setup((_u, _i, h) => reply(h, 200, STORED));
    for (const id of ["", ".", ".."]) await failure(requestContacts.read(id));
    expect(fetchMock).not.toHaveBeenCalled();
    await requestContacts.read("A/B");
    expect(call().url.pathname).toBe("/rpp/requestContacts/A%2FB");
  });

  it("stop when aborted", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) reject(signal.reason);
          else signal?.addEventListener("abort", () => reject(signal.reason));
        }),
    );
    const client = createRppClient({ transport: createFetchTransport({ baseUrl: BASE, fetch: fetchMock }) });
    const pending = client.extension(requestContactOperations).read("X-1", { signal: controller.signal });
    controller.abort();
    expect((await failure(pending)).failure).toMatchObject({ kind: "transport", transportKind: "aborted" });
  });

  it("fail with an authentication failure on 401", async () => {
    const problem = { type: "urn:ietf:params:rpp:error", title: "Unauthorized", errors: [{ type: "t", result: "02200", reason: "no" }] };
    const { requestContacts } = setup((_u, _i, h) => reply(h, 401, problem, { "RPP-Code": "02200" }, "application/problem+json"));
    expect((await failure(requestContacts.read("X-1"))).failure.kind).toBe("authentication");
  });
});

describe("request contact schema validation", () => {
  const PRESET = { id: "de.denic.rpp.preset.rri", version: "1.0" };
  // The definitions of the extension's schema as a Preset Schema states them (json §7.2), with the base definitions they use.
  const schema = {
    $schema: JSON_SCHEMA_2020_12,
    "rpp:preset": PRESET,
    $defs: {
      identifier: { type: "string", minLength: 3, maxLength: 64 },
      "provMetadata.read": { type: "object", properties: { "@type": { const: "provMetadata" }, spClientId: { type: "string" }, upDate: { type: "string" } }, required: ["@type", "spClientId"] },
      "ext.rri.uriTemplate": { type: "string", minLength: 8, maxLength: 1024 },
      "ext.rri.requestContact.create": {
        type: "object",
        properties: { "@type": { type: "string", const: "requestContact" }, id: { $ref: "#/$defs/identifier" }, uriTemplate: { $ref: "#/$defs/ext.rri.uriTemplate" } },
        required: ["@type", "id", "uriTemplate"],
      },
      "ext.rri.requestContact.read": {
        type: "object",
        properties: {
          "@type": { type: "string", const: "requestContact" },
          id: { $ref: "#/$defs/identifier" },
          provMetadata: { $ref: "#/$defs/provMetadata.read" },
          uriTemplate: { $ref: "#/$defs/ext.rri.uriTemplate" },
        },
        required: ["@type", "id", "provMetadata", "uriTemplate"],
      },
      "ext.rri.requestContact.update": {
        type: "object",
        properties: { "@type": { type: "string", const: "requestContact" }, uriTemplate: { $ref: "#/$defs/ext.rri.uriTemplate" } },
        required: ["@type", "uriTemplate"],
      },
    },
  };
  const validation = () => {
    const registry = createSchemaRegistry();
    registry.addPresetSchema(schema, PRESET);
    return { registry, preset: PRESET };
  };

  it("checks requests against the definitions of the extension and refuses an invalid one before sending", async () => {
    const { requestContacts, fetchMock } = setup((_u, _i, h) => reply(h, 201, STORED), { validation: validation() });
    const error = await failure(requestContacts.create({ "@type": "requestContact", id: "DENIC-1000022-GR", uriTemplate: "http://" }));
    expect(error.failure).toMatchObject({ kind: "schema-validation", direction: "request", definition: "ext.rri.requestContact.create" });
    expect(error.failure.kind === "schema-validation" && error.failure.issues[0]).toMatchObject({ instancePath: "/uriTemplate", keyword: "minLength" });
    const missing = await failure(requestContacts.replace("DENIC-1000022-GR", { "@type": "requestContact" } as never));
    expect(missing.failure).toMatchObject({ definition: "ext.rri.requestContact.update" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks responses against the read definition", async () => {
    const valid = setup((_u, _i, h) => reply(h, 200, STORED), { validation: validation() });
    expect((await valid.requestContacts.read("DENIC-1000022-GR")).meta.validation.response).toEqual({ status: "valid" });
    const invalid = setup((_u, _i, h) => reply(h, 200, { "@type": "requestContact", id: "DENIC-1000022-GR" }), { validation: validation() });
    const result = await invalid.requestContacts.read("DENIC-1000022-GR");
    expect(result.meta.validation.response).toMatchObject({ status: "invalid" });
  });
});

describe("URI template of a request contact", () => {
  it("accepts the templates of the extension's examples", () => {
    for (const template of [TEMPLATE, "mailto:abuse@example.com", "https://www.example.com/abuse/{Ulabel}", "HTTP://x.example/{Alabel}/%7E"]) {
      expect(checkUriTemplate(template)).toEqual([]);
    }
  });

  it("names each constraint that is not met", () => {
    const codes = (template: string) => checkUriTemplate(template).map((issue) => issue.code);
    expect(codes("http://")).toEqual(["too-short"]);
    expect(codes(`https://x.example/${"a".repeat(1024)}`)).toEqual(["too-long"]);
    expect(codes("ftp://files.example/")).toEqual(["scheme"]);
    expect(codes("www.example.com/{Alabel}")).toEqual(["scheme"]);
    expect(codes("https://x.example/{alabel}")).toEqual(["unknown-variable"]);
    expect(codes("https://x.example/{domain}")).toEqual(["unknown-variable"]);
    expect(codes("https://x.example/{+Alabel}")).toEqual(["not-level-1"]);
    expect(codes("https://x.example/{Alabel,Ulabel}")).toEqual(["not-level-1"]);
    expect(codes("https://x.example/{Alabel")).toEqual(["unclosed-expression"]);
    expect(codes("https://x.example/Alabel}")).toEqual(["stray-brace"]);
    expect(codes("https://x.example/a b")).toEqual(["invalid-literal"]);
    expect(codes("https://x.example/100%")).toEqual(["invalid-literal"]);
    expect(codes("https://bücher.example/{Ulabel}")).toEqual(["not-ascii"]);
  });

  it("expands Alabel and Ulabel by simple string expansion", () => {
    expect(expandUriTemplate("https://x.example/?d={Alabel}&u={Ulabel}", { Alabel: "xn--bcher-kva.de", Ulabel: "bücher.de" })).toBe(
      "https://x.example/?d=xn--bcher-kva.de&u=b%C3%BCcher.de",
    );
    expect(expandUriTemplate("mailto:abuse@example.com", { Alabel: "a.de", Ulabel: "a.de" })).toBe("mailto:abuse@example.com");
  });
});
