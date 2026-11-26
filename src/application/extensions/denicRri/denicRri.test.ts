import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "@/rpp/client/FetchTransport";
import type { DomainName } from "@/rpp/core/types/objects";
import { RppError } from "@/rpp/errors/RppError";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { DENIC_RRI } from "@/rpp/extensions/modules/denicRri";
import { createRppClient } from "@/rpp/operations/RppClient";
import { extensionActivation, extensionObjectSupport } from "@/application/capability";
import { createDomainWorkflows, registerBody } from "@/application/domains/domainWorkflows";
import { createRequestContactWorkflows, uriTemplateProblems } from "./requestContactWorkflows";
import { buildRriDomainPatch, describeRriPatchOperation, rriDomainMembers, rriEditOf, rriTransferMembers } from "./rriDomain";

const BASE = "https://rpp.example.test/rpp";

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(
    async (_input, init) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/rpp+json" }),
          "RPP-Cltrid": new Headers(init?.headers).get("RPP-Cltrid") ?? "",
          "RPP-Code": "01000",
        },
      }),
  );
  const client = createRppClient({ transport: createFetchTransport({ baseUrl: BASE, fetch: fetchMock }) });
  const last = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
    return {
      method: init?.method,
      path: (url as URL).pathname,
      headers: new Headers(init?.headers),
      body: init?.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown),
    };
  };
  return { client, last, fetchMock };
}

const DOMAIN: DomainName = {
  "@type": "domainName",
  name: "foo.de",
  provMetadata: { "@type": "provMetadata", spClientId: "DENIC-1000022" },
  status: [{ "@type": "domainStatus", label: "ok" }],
  registrant: { "@type": "contact", id: "DENIC-1000022-HOLDER" },
  generalRequest: { "@type": "requestContact", id: "DENIC-1000022-GR" },
  abuse: { "@type": "requestContact", id: "DENIC-1000022-AB" },
};

describe("request contact workflows", () => {
  const STORED = { "@type": "requestContact", id: "DENIC-1000022-GR", provMetadata: { "@type": "provMetadata", spClientId: "DENIC-1000022" }, uriTemplate: "mailto:abuse@example.com" };

  it("create with the handle trimmed and the template as typed", async () => {
    const { client, last } = setup(STORED, 201);
    await createRequestContactWorkflows(client).create({ id: "  DENIC-1000022-GR ", uriTemplate: " mailto:abuse@example.com" });
    expect(last()).toMatchObject({
      method: "POST",
      path: "/rpp/requestContacts",
      body: { "@type": "requestContact", id: "DENIC-1000022-GR", uriTemplate: " mailto:abuse@example.com" },
    });
  });

  it("change the template with a full or a partial update", async () => {
    const { client, last } = setup(STORED);
    const workflows = createRequestContactWorkflows(client);
    await workflows.update("DENIC-1000022-GR", { mode: "full", body: { "@type": "requestContact", uriTemplate: "https://www.example.com/abuse/{Ulabel}" }, includeElements: [] });
    expect(last()).toMatchObject({
      method: "PUT",
      path: "/rpp/requestContacts/DENIC-1000022-GR",
      body: { "@type": "requestContact", uriTemplate: "https://www.example.com/abuse/{Ulabel}" },
    });
    await workflows.update("DENIC-1000022-GR", { mode: "partial", operations: [{ op: "replace", path: "/uriTemplate", value: "mailto:abuse@example.com" }] });
    expect(last()).toMatchObject({ method: "PATCH", body: [{ op: "replace", path: "/uriTemplate", value: "mailto:abuse@example.com" }] });
  });

  it("read and check by handle, and send nothing without one", async () => {
    const { client, last, fetchMock } = setup({ "@type": "requestContactAvailability", available: false, reason: "In use" }, 404);
    const workflows = createRequestContactWorkflows(client);
    expect(await workflows.check("DENIC-1000022-GR")).toMatchObject({ available: false, details: { reason: "In use" } });
    expect(last().path).toBe("/rpp/requestContacts/DENIC-1000022-GR/availability");
    await expect(workflows.info("  ")).rejects.toBeInstanceOf(RppError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("describe the problems of a template for a registrar", () => {
    expect(uriTemplateProblems("https://www.example.com/contact?domain={Alabel}")).toEqual([]);
    expect(uriTemplateProblems("ftp://x.example/{domain}")).toEqual([
      "Start with http:, https: or mailto:.",
      "{domain} is not known; only {Alabel} and {Ulabel} can be used.",
    ]);
  });
});

describe("request contacts of a domain", () => {
  it("are read from the references of the domain, and only from references", () => {
    expect(rriEditOf(DOMAIN)).toEqual({ generalRequest: "DENIC-1000022-GR", abuse: "DENIC-1000022-AB" });
    expect(rriEditOf({ ...DOMAIN, generalRequest: "nonsense", abuse: { "@type": "contact", id: "X" } })).toEqual({ generalRequest: "", abuse: "" });
  });

  it("are sent with a registration as references, leaving out empty ones", () => {
    expect(rriDomainMembers({ generalRequest: " DENIC-1000022-GR ", abuse: "" })).toEqual({ generalRequest: { "@type": "requestContact", id: "DENIC-1000022-GR" } });
    const body = registerBody({
      name: "foo.de",
      registrant: "DENIC-1000022-HOLDER",
      contacts: [{ label: "registrant", id: "DENIC-1000022-HOLDER2" }],
      contactRoles: ["registrant"],
      extensionMembers: rriDomainMembers({ generalRequest: "DENIC-1000022-GR", abuse: "DENIC-1000022-AB" }),
    });
    expect(body).toEqual({
      "@type": "domainName",
      name: "foo.de",
      registrant: { "@type": "contact", id: "DENIC-1000022-HOLDER" },
      contacts: [{ label: "registrant", object: { "@type": "contact", id: "DENIC-1000022-HOLDER2" } }],
      generalRequest: { "@type": "requestContact", id: "DENIC-1000022-GR" },
      abuse: { "@type": "requestContact", id: "DENIC-1000022-AB" },
    });
  });

  it("cannot replace a member of the base object", () => {
    expect(() => registerBody({ name: "foo.de", registrant: "A", extensionMembers: { registrant: { "@type": "contact", id: "B" } } })).toThrow(
      "cannot set registrant",
    );
  });

  it("are changed with one operation each, as in the extension's partial update example", () => {
    expect(buildRriDomainPatch(DOMAIN, { generalRequest: "DENIC-1000022-GR", abuse: "DENIC-1000022-AB" })).toEqual([]);
    expect(buildRriDomainPatch(DOMAIN, { generalRequest: "", abuse: "DENIC-1000022-AB2" })).toEqual([
      { op: "remove", path: "/generalRequest" },
      { op: "replace", path: "/abuse", value: { "@type": "requestContact", id: "DENIC-1000022-AB2" } },
    ]);
    const without: DomainName = { ...DOMAIN, generalRequest: undefined, abuse: undefined };
    delete without.generalRequest;
    delete without.abuse;
    expect(buildRriDomainPatch(without, { generalRequest: "G", abuse: "" })).toEqual([
      { op: "add", path: "/generalRequest", value: { "@type": "requestContact", id: "G" } },
    ]);
  });

  it("leave a value that is no reference alone unless a handle is entered", () => {
    const odd = { ...DOMAIN, abuse: "unexpected" };
    expect(buildRriDomainPatch(odd, { generalRequest: "DENIC-1000022-GR", abuse: "" })).toEqual([]);
    expect(buildRriDomainPatch(odd, { generalRequest: "DENIC-1000022-GR", abuse: "A" })).toEqual([
      { op: "replace", path: "/abuse", value: { "@type": "requestContact", id: "A" } },
    ]);
  });

  it("are described for the summary before sending", () => {
    expect(describeRriPatchOperation({ op: "remove", path: "/generalRequest" })).toBe("Remove general request contact");
    expect(describeRriPatchOperation({ op: "add", path: "/abuse", value: { "@type": "requestContact", id: "A" } })).toBe("Add abuse contact A");
    expect(describeRriPatchOperation({ op: "remove", path: "/registrant" })).toBeUndefined();
  });
});

describe("transfer request under DENIC RRI", () => {
  const NONE = { holders: [], generalRequest: "", abuse: "", records: [], dnskeys: [] };

  it("carries the domain as the gaining client holds it after the transfer, with every record type the extension allows", () => {
    expect(
      rriTransferMembers("foo.de", {
        registrant: " DENIC-1000002-HOLDER ",
        holders: ["DENIC-1000002-HOLDER2", " "],
        generalRequest: "DENIC-1000002-GENERAL",
        abuse: "DENIC-1000002-ABUSE",
        records: [
          { type: "ns", name: "@", nsdname: "ns1.foo.de" },
          { type: "ns", name: "@", nsdname: "ns2.example.com." },
          { type: "a", name: "ns1", address: "192.0.2.1" },
          { type: "aaaa", name: "ns1.foo.de.", address: "2001:db8::1" },
          { type: "mx", name: "@", preference: "10", exchange: "mail.example.com" },
        ],
        dnskeys: [{ flags: "257", protocol: "3", algorithm: "13", publicKey: "AwEAAa==" }],
      }),
    ).toEqual({
      registrant: { "@type": "contact", id: "DENIC-1000002-HOLDER" },
      contacts: [{ label: "registrant", object: { "@type": "contact", id: "DENIC-1000002-HOLDER2" } }],
      generalRequest: { "@type": "requestContact", id: "DENIC-1000002-GENERAL" },
      abuse: { "@type": "requestContact", id: "DENIC-1000002-ABUSE" },
      dns: {
        "@type": "dnsData",
        records: [
          // As typed: with or without the trailing dot, nothing is added or taken away.
          { "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns1.foo.de" } },
          { "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns2.example.com." } },
          { "@type": "dnsRecord", name: "ns1", type: "a", rdata: { address: "192.0.2.1" } },
          { "@type": "dnsRecord", name: "ns1.foo.de.", type: "aaaa", rdata: { address: "2001:db8::1" } },
          { "@type": "dnsRecord", name: "@", type: "mx", rdata: { preference: "10", exchange: "mail.example.com" } },
          { "@type": "dnsRecord", name: "@", type: "dnskey", rdata: { flags: "257", protocol: "3", algorithm: "13", publicKey: "AwEAAa==" } },
        ],
      },
    });
  });

  it("refuses a record with a problem before sending, as a registration does", () => {
    expect(() => rriTransferMembers("foo.de", { ...NONE, registrant: "H", records: [{ type: "a", name: "ns1", address: "2001:db8::1" }] })).toThrow(RppError);
    expect(() => rriTransferMembers("foo.de", { ...NONE, registrant: "H", records: [{ type: "ns", name: "ns.other.de.", nsdname: "ns1.foo.de" }] })).toThrow(RppError);
  });

  it("needs a registrant, and sends DNS data even without records", () => {
    expect(() => rriTransferMembers("foo.de", { ...NONE, registrant: " " })).toThrow(RppError);
    expect(rriTransferMembers("foo.de", { ...NONE, registrant: "H" })).toEqual({
      registrant: { "@type": "contact", id: "H" },
      dns: { "@type": "dnsData" },
    });
  });

  it("is sent in the body, with the password only in RPP-Authorization", async () => {
    const { client, last } = setup({ "@type": "domainTransferProcess", trStatus: "serverApproved" });
    const members = rriTransferMembers("foo.de", { ...NONE, registrant: "H", generalRequest: "G", records: [{ type: "ns", name: "@", nsdname: "ns1.example.com" }] });
    await createDomainWorkflows(client).transfer.request("foo.de", { authInfo: "Abc2345678", extensionMembers: members });
    const sent = last();
    expect(sent.method).toBe("POST");
    expect(sent.path).toBe("/rpp/domainNames/foo.de/processes/transferProcesses");
    expect(sent.headers.get("RPP-Authorization")).toMatch(/^authinfo value=/);
    expect(sent.body).toEqual({ "@type": "domainTransferProcess", ...members });
    expect(JSON.stringify(sent.body)).not.toContain("Abc2345678");
  });
});

describe("extension capability", () => {
  const SOURCE = {
    url: "https://rpp.example.test/.well-known/rpp",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    exchangeId: "x-1",
    correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
  };
  const RRI = { id: "de.denic.rpp.rri", version: "0.2.0" };
  const ready = (objects: string[]): DiscoveryState => ({
    status: "ready",
    snapshot: parseDiscoveryDocument(
      { "@type": "discovery", objects, extensions: [RRI], presets: [{ id: "de.denic.rpp.preset.rri", version: "1.0", defaultPreset: true, extensions: [RRI] }] },
      SOURCE,
    ).snapshot,
  });

  it("is unknown before discovery and never assumed", () => {
    expect(extensionActivation({ status: "loading" }, DENIC_RRI, undefined)).toBeUndefined();
    expect(extensionObjectSupport({ status: "not-started" }, DENIC_RRI, "requestContact", undefined)).toBe("unknown");
  });

  it("offers the extension's object only when it is active and listed", () => {
    expect(extensionActivation(ready(["domainName"]), DENIC_RRI, undefined)?.status).toBe("active");
    expect(extensionObjectSupport(ready(["domainName", "requestContact"]), DENIC_RRI, "requestContact", undefined)).toBe("offered");
    expect(extensionObjectSupport(ready(["domainName"]), DENIC_RRI, "requestContact", undefined)).toBe("not-offered");
  });
});
