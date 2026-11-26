import { describe, expect, it } from "vitest";
import presetSchema from "@/test/fixtures/rri-preset-schema.json";
import { definitionMembers, projectToDefinition } from "./projection";

const DOMAIN_READ = {
  "@type": "domainName",
  name: "foo.de",
  provMetadata: { "@type": "provMetadata", spClientId: "DENIC-1000022", crDate: "2026-01-01T00:00:00Z" },
  status: [
    { "@type": "domainStatus", label: "ok" },
    { "@type": "domainStatus", label: "clientHold", reason: "court order" },
  ],
  registrant: { "@type": "contact", id: "DENIC-1000022-HOLDER" },
  contacts: [{ label: "registrant", object: { "@type": "contact", id: "DENIC-1000022-HOLDER2" } }],
  generalRequest: { "@type": "requestContact", id: "DENIC-1000022-GR" },
  dns: { "@type": "dnsData", records: [{ "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns1.foo.de" } }] },
  expiryDate: "2027-01-01T00:00:00Z",
  processes: { "@type": "processes", createProcess: [] },
};

describe("projection onto a definition", () => {
  it("turns a read view into the update view of the preset, extension members included", () => {
    const { value, dropped } = projectToDefinition(presetSchema, "domainName.update", DOMAIN_READ);
    expect(value).toEqual({
      "@type": "domainName",
      status: [{ "@type": "domainStatus", label: "clientHold", reason: "court order" }],
      registrant: { "@type": "contact", id: "DENIC-1000022-HOLDER" },
      contacts: [{ label: "registrant", object: { "@type": "contact", id: "DENIC-1000022-HOLDER2" } }],
      generalRequest: { "@type": "requestContact", id: "DENIC-1000022-GR" },
      dns: { "@type": "dnsData", records: [{ "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns1.foo.de" } }] },
    });
    expect(dropped.sort()).toEqual(["/expiryDate", "/name", "/processes", "/provMetadata", "/status/0"]);
  });

  it("names the members of a definition, across allOf", () => {
    expect(definitionMembers(presetSchema, "domainName.update")).toEqual(
      expect.arrayContaining(["@type", "status", "registrant", "contacts", "nameservers", "dns", "authInfo", "generalRequest", "abuse"]),
    );
    expect(definitionMembers(presetSchema, "ext.rri.requestContact.update")).toEqual(["@type", "uriTemplate"]);
    expect(definitionMembers(presetSchema, "nothing.update")).toEqual([]);
  });

  it("keeps what the schema says nothing about, and never changes the input", () => {
    const document = { $defs: { open: { type: "object" }, "x.update": { type: "object", properties: { a: { $ref: "#/$defs/open" } } } } };
    const input = { a: { anything: [1, 2] }, b: 1 };
    expect(projectToDefinition(document, "x.update", input)).toEqual({ value: { a: { anything: [1, 2] } }, dropped: ["/b"] });
    expect(input).toEqual({ a: { anything: [1, 2] }, b: 1 });
  });

  it("follows maps of additionalProperties and leaves anyOf alone", () => {
    const document = {
      $defs: {
        "x.update": {
          type: "object",
          properties: {
            roles: { type: "object", additionalProperties: { type: "object", properties: { roleId: { type: "string" } } } },
            either: { anyOf: [{ type: "object", properties: { a: {} } }, { type: "string" }] },
          },
        },
      },
    };
    expect(projectToDefinition(document, "x.update", { roles: { registrar: { roleId: "1", status: [] } }, either: { a: 1, b: 2 } })).toEqual({
      value: { roles: { registrar: { roleId: "1" } }, either: { a: 1, b: 2 } },
      dropped: ["/roles/registrar/status"],
    });
  });

  it("refuses a definition the document does not have", () => {
    expect(() => projectToDefinition(presetSchema, "nothing.update", {})).toThrow("no definition nothing.update");
  });
});
