import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "../client/FetchTransport";
import { RppError } from "../errors/RppError";
import { enrichWithUnevaluatedProperties } from "./enrichSchema";
import { loadPresetSchema } from "./presetSchemaLoader";
import { createSchemaRegistry, JSON_SCHEMA_2020_12, SchemaDocumentError } from "./SchemaRegistry";
import { issueTarget } from "./validation";

const PRESET = { id: "urn:ietf:params:rpp:preset:epp-compatible", version: "1.0" };

// Shaped like a Preset Schema (json §Preset Schema): definitions of RPP, an extension sub-schema and a profile
// sub-schema composed with allOf under the key of the base definition.
function presetSchema(overrides: Record<string, unknown> = {}) {
  return {
    $schema: JSON_SCHEMA_2020_12,
    $id: "https://rpp.example.test/rpp/presets/urn:ietf:params:rpp:preset:epp-compatible/schema",
    "rpp:preset": PRESET,
    $defs: {
      "period.create": {
        type: "object",
        properties: {
          "@type": { type: "string", const: "period" },
          value: { type: "integer", minimum: 1, maximum: 99 },
          unit: { type: "string", enum: ["y", "m"] },
        },
        required: ["@type", "value", "unit"],
      },
      "host.reference": {
        type: "object",
        properties: { "@type": { type: "string", const: "host" }, hostName: { type: "string", format: "hostname" } },
        required: ["@type", "hostName"],
      },
      "dnsRecord.create": {
        type: "object",
        properties: {
          "@type": { type: "string", const: "dnsRecord" },
          rdata: { type: "object", unevaluatedProperties: true },
        },
        required: ["@type", "rdata"],
      },
      "domainName.create": {
        allOf: [
          {
            type: "object",
            properties: {
              "@type": { type: "string", const: "domainName" },
              name: { type: "string", format: "hostname" },
              nameservers: { type: "array", items: { $ref: "#/$defs/host.reference" } },
              period: { $ref: "#/$defs/period.create" },
              records: { type: "array", items: { $ref: "#/$defs/dnsRecord.create" } },
            },
            required: ["@type", "name"],
          },
          { $ref: "#/$defs/ext.domain" },
          { $ref: "#/$defs/profile.domain" },
        ],
      },
      "ext.domain": {
        type: "object",
        properties: { foo: { type: "string" } },
        required: ["foo"],
      },
      "profile.domain": { properties: { nameservers: { minItems: 2 } } },
    },
    ...overrides,
  };
}

const domain = (extra: Record<string, unknown> = {}) => ({
  "@type": "domainName",
  name: "example.test",
  foo: "x",
  nameservers: [
    { "@type": "host", hostName: "ns1.example.test" },
    { "@type": "host", hostName: "ns2.example.test" },
  ],
  ...extra,
});

function registry() {
  const registry = createSchemaRegistry();
  registry.addPresetSchema(presetSchema(), PRESET);
  return registry;
}

describe("enrichWithUnevaluatedProperties", () => {
  it("adds the keyword to object schemas and allOf holders, not to branches or conditions", () => {
    const enriched = enrichWithUnevaluatedProperties(presetSchema());
    const defs = enriched.$defs as Record<string, any>;
    expect(defs["period.create"].unevaluatedProperties).toBe(false);
    expect(defs["domainName.create"].unevaluatedProperties).toBe(false);
    expect(defs["domainName.create"].allOf[0].unevaluatedProperties).toBeUndefined();
    expect(defs["ext.domain"].unevaluatedProperties).toBeUndefined();
    expect(defs["profile.domain"].unevaluatedProperties).toBeUndefined();
    expect(defs["dnsRecord.create"].properties.rdata.unevaluatedProperties).toBe(true);
  });

  it("works on a copy", () => {
    const original = presetSchema();
    enrichWithUnevaluatedProperties(original);
    expect((original.$defs as Record<string, any>)["period.create"].unevaluatedProperties).toBeUndefined();
  });
});

describe("SchemaRegistry validation", () => {
  it("accepts a conforming object, including members from the extension", () => {
    expect(registry().validate(PRESET, "domainName.create", domain())).toEqual({ status: "valid" });
  });

  it("reports where and why, with machine-readable parts", () => {
    const result = registry().validate(PRESET, "domainName.create", domain({ period: { "@type": "period", value: 100, unit: "d" } }));
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instancePath: "/period/value", keyword: "maximum", params: { comparison: "<=", limit: 99 } }),
        expect.objectContaining({ instancePath: "/period/unit", keyword: "enum" }),
      ]),
    );
    expect(result.issues.every((issue) => issue.message && issue.schemaPath)).toBe(true);
  });

  it("reports a missing required member at the member", () => {
    const { foo: _foo, ...withoutFoo } = domain();
    const result = registry().validate(PRESET, "domainName.create", withoutFoo);
    expect(result.status === "invalid" && result.issues.map(issueTarget)).toEqual(["/foo"]);
  });

  it("rejects undeclared properties at every level (json §4.9.1) but not where the schema is open", () => {
    const r = registry();
    const top = r.validate(PRESET, "domainName.create", domain({ extra: 1 }));
    expect(top.status === "invalid" && top.issues.map(issueTarget)).toEqual(["/extra"]);
    const nested = r.validate(PRESET, "domainName.create", domain({ period: { "@type": "period", value: 1, unit: "y", more: true } }));
    expect(nested.status === "invalid" && nested.issues.map(issueTarget)).toEqual(["/period/more"]);
    const open = r.validate(PRESET, "domainName.create", domain({ records: [{ "@type": "dnsRecord", rdata: { anything: [1] } }] }));
    expect(open).toEqual({ status: "valid" });
  });

  it("applies the constraints of a profile composed into the definition", () => {
    const result = registry().validate(PRESET, "domainName.create", domain({ nameservers: [{ "@type": "host", hostName: "ns1.example.test" }] }));
    expect(result.status === "invalid" && result.issues.map((issue) => issue.keyword)).toEqual(["minItems"]);
  });

  it("checks formats and does not change the value", () => {
    const value = domain({ name: "not a hostname!" });
    const copy = structuredClone(value);
    const result = registry().validate(PRESET, "domainName.create", value);
    expect(result.status === "invalid" && result.issues[0]?.keyword).toBe("format");
    expect(value).toEqual(copy);
  });

  it("is unavailable, not valid, when there is nothing to validate against", () => {
    const r = registry();
    expect(r.validate({ id: "other", version: "1.0" }, "domainName.create", {})).toMatchObject({ status: "unavailable" });
    expect(r.validate(PRESET, "nothing.create", {})).toMatchObject({ status: "unavailable" });
    expect(createSchemaRegistry().validate(PRESET, "x", {})).toMatchObject({ status: "unavailable" });
  });

  it("lists, replaces and keys schemas by identifier and version", () => {
    const r = registry();
    expect(r.has(PRESET)).toBe(true);
    expect(r.has({ ...PRESET, version: "2.0" })).toBe(false);
    expect(r.definitions(PRESET)).toContain("domainName.create");
    r.addPresetSchema(presetSchema({ $defs: { "period.create": { type: "string" } } }));
    expect(r.definitions(PRESET)).toEqual(["period.create"]);
    expect(r.validate(PRESET, "period.create", "x")).toEqual({ status: "valid" });
    expect(r.keys()).toEqual([PRESET]);
  });

  it("assigns an id when the document has none", () => {
    const r = createSchemaRegistry();
    const { $id: _id, ...withoutId } = presetSchema();
    r.addPresetSchema(withoutId);
    expect(r.validate(PRESET, "domainName.create", domain())).toEqual({ status: "valid" });
  });
});

describe("SchemaRegistry document checks", () => {
  const rejects = (document: unknown, message: string, expected = PRESET) =>
    expect(() => createSchemaRegistry().addPresetSchema(document, expected)).toThrow(
      expect.objectContaining({ name: "SchemaDocumentError", message: expect.stringContaining(message) }),
    );

  it("refuses documents it cannot trust", () => {
    rejects("x", "not a JSON object");
    rejects(presetSchema({ $schema: "http://json-schema.org/draft-07/schema#" }), "2020-12");
    rejects(presetSchema({ "rpp:preset": undefined }), "rpp:preset");
    rejects(presetSchema({ "rpp:preset": { id: "other", version: "1.0" } }), "not for");
    rejects(presetSchema({ $defs: undefined }), "no $defs");
    rejects(presetSchema({ $defs: { a: { $ref: "https://evil.test/x.json" } } }), "not self-contained");
    rejects(presetSchema({ $defs: { a: { items: [{ $dynamicRef: "other.json#x" }] } } }), "not self-contained");
    rejects(presetSchema({ $defs: { a: { type: "nonsense" } } }), "not a valid schema");
  });

  it("refuses an $id that another preset uses", () => {
    const r = registry();
    expect(() => r.addPresetSchema(presetSchema({ "rpp:preset": { id: "x", version: "1.0" } }))).toThrow(SchemaDocumentError);
  });
});

describe("loadPresetSchema", () => {
  const setup = (respond: () => Response) => {
    const fetchMock = vi.fn<typeof fetch>(async () => respond());
    const transport = createFetchTransport({ baseUrl: "https://rpp.example.test/rpp", fetch: fetchMock });
    return { fetchMock, transport, registry: createSchemaRegistry() };
  };
  const schemaResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/schema+json", "RPP-Code": "01000" } });

  it("fetches the schema sub-resource in its native media type and registers it", async () => {
    const { fetchMock, transport, registry } = setup(() => schemaResponse(presetSchema()));
    await expect(loadPresetSchema({ transport, registry, preset: PRESET })).resolves.toEqual(PRESET);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect((url as URL).href).toBe("https://rpp.example.test/rpp/presets/urn:ietf:params:rpp:preset:epp-compatible/schema");
    const headers = new Headers(init?.headers);
    expect(headers.get("Accept")).toBe("application/schema+json");
    expect(headers.has("RPP-Preset")).toBe(false);
    expect(registry.has(PRESET)).toBe(true);
  });

  it("rejects with the failure of the response, or of the document", async () => {
    const missing = setup(() =>
      new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "RPP Error", errors: [] }), {
        status: 404,
        headers: { "Content-Type": "application/problem+json" },
      }),
    );
    const notFound = await loadPresetSchema({ ...missing, preset: PRESET }).catch((e: unknown) => e);
    expect(notFound).toBeInstanceOf(RppError);
    expect((notFound as RppError).failure).toMatchObject({ kind: "rpp-protocol", status: 404 });

    const wrong = setup(() => schemaResponse(presetSchema({ "rpp:preset": { id: "other", version: "1.0" } })));
    const mismatch = await loadPresetSchema({ ...wrong, preset: PRESET }).catch((e: unknown) => e);
    expect((mismatch as RppError).failure).toMatchObject({ kind: "schema-document" });
    expect(wrong.registry.has(PRESET)).toBe(false);
  });
});
