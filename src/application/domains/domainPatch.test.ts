import { describe, expect, it } from "vitest";
import type { DomainName } from "@/rpp/core/types/objects";
import { buildDomainPatch, describePatchOperation, editOf, type DomainEdit } from "./domainPatch";

const domain: DomainName = {
  "@type": "domainName",
  name: "example.test",
  provMetadata: { "@type": "provMetadata", spClientId: "REG" },
  status: [
    { "@type": "domainStatus", label: "ok" },
    { "@type": "domainStatus", label: "clientHold" },
    { "@type": "domainStatus", label: "serverTransferProhibited" },
  ],
  registrant: { "@type": "contact", id: "C-1" },
  contacts: [{ label: "tech", object: { "@type": "contact", id: "C-2" } }],
  nameservers: [
    { "@type": "host", hostName: "ns1.example.test" },
    { "@type": "host", hostName: "ns2.example.test" },
  ],
};

describe("domain patch", () => {
  it("starts from the domain and asks for nothing when nothing was edited", () => {
    const edit = editOf(domain);
    expect(edit).toEqual({
      registrant: "C-1",
      contacts: [{ label: "tech", id: "C-2" }],
      nameservers: ["ns1.example.test", "ns2.example.test"],
      clientStatuses: ["clientHold"],
      authInfo: { action: "keep" },
      records: [],
    });
    expect(buildDomainPatch(domain, edit)).toEqual([]);
  });

  it("replaces, adds and removes the registrant", () => {
    const edit = editOf(domain);
    expect(buildDomainPatch(domain, { ...edit, registrant: "C-9" })).toEqual([
      { op: "replace", path: "/registrant", value: { "@type": "contact", id: "C-9" } },
    ]);
    expect(buildDomainPatch(domain, { ...edit, registrant: " " })).toEqual([{ op: "remove", path: "/registrant" }]);
    const without = { ...domain, registrant: undefined };
    expect(buildDomainPatch(without, { ...editOf(without), registrant: "C-9" })).toEqual([
      { op: "add", path: "/registrant", value: { "@type": "contact", id: "C-9" } },
    ]);
  });

  it("names each contact and nameserver that goes or comes, and leaves the others", () => {
    const edit = editOf(domain);
    const operations = buildDomainPatch(domain, {
      ...edit,
      contacts: [{ label: "admin", id: "C-3" }, { label: "", id: "" }],
      nameservers: ["ns2.example.test", " ns3.example.test ", "ns3.example.test"],
    });
    expect(operations).toEqual([
      { op: "remove", path: "/contacts", match: { label: "tech", object: { id: "C-2" } } },
      { op: "add", path: "/contacts", value: { label: "admin", object: { "@type": "contact", id: "C-3" } } },
      { op: "remove", path: "/nameservers", match: { hostName: "ns1.example.test" } },
      { op: "add", path: "/nameservers", value: { "@type": "host", hostName: "ns3.example.test" } },
    ]);
  });

  it("changes client statuses only; a status set by the server is never touched", () => {
    const edit = editOf(domain);
    expect(buildDomainPatch(domain, { ...edit, clientStatuses: ["clientDeleteProhibited"] })).toEqual([
      { op: "remove", path: "/status", match: { label: "clientHold" } },
      { op: "add", path: "/status", value: { "@type": "domainStatus", label: "clientDeleteProhibited" } },
    ]);
  });

  it("sets or removes the authorisation information when told to", () => {
    const edit = editOf(domain);
    expect(buildDomainPatch(domain, { ...edit, authInfo: { action: "set", value: "pw" } })).toEqual([
      { op: "add", path: "/authInfo", value: { "@type": "authInfo", method: "authinfo", authdata: "pw" } },
    ]);
    expect(buildDomainPatch(domain, { ...edit, authInfo: { action: "remove" } })).toEqual([{ op: "remove", path: "/authInfo" }]);
  });

  it("describes each operation without the password", () => {
    const edit: DomainEdit = { ...editOf(domain), registrant: "C-9", contacts: [{ label: "admin", id: "C-3" }], nameservers: ["ns3.example.test"], clientStatuses: [], authInfo: { action: "set", value: "pw" } };
    const lines = buildDomainPatch(domain, edit).map(describePatchOperation);
    expect(lines).toEqual([
      "Replace the registrant with C-9",
      "Remove contact tech C-2",
      "Add contact admin C-3",
      "Remove name server ns1.example.test",
      "Remove name server ns2.example.test",
      "Add name server ns3.example.test",
      "Remove status clientHold",
      "Set the transfer password",
    ]);
    expect(lines.join()).not.toContain("pw");
    expect(describePatchOperation({ op: "remove", path: "/registrant" })).toBe("Remove the registrant");
  });
});

describe("DNS records in the domain patch", () => {
  const delegated: DomainName = {
    "@type": "domainName",
    name: "example.de",
    provMetadata: { "@type": "provMetadata", spClientId: "REG" },
    status: [],
    dns: {
      "@type": "dnsData",
      records: [
        { "@type": "dnsRecord", name: "@", type: "NS", rdata: { nsdname: "ns1.example.de" } },
        { "@type": "dnsRecord", name: "ns1", type: "a", rdata: { address: "192.0.2.1" } },
        { "@type": "dnsRecord", name: "@", type: "ds", rdata: { keyTag: "1", algorithm: "13", digestType: "2", digest: "AB" } },
        { "@type": "dnsRecord", name: "@", type: "mx", rdata: { preference: "10", exchange: "mail.example.net", future: "kept" } },
      ],
    },
  };

  it("edits only NS, A, AAAA and MX records, matching types without case", () => {
    expect(editOf(delegated).records).toEqual([
      { type: "ns", name: "@", nsdname: "ns1.example.de" },
      { type: "a", name: "ns1", address: "192.0.2.1" },
      { type: "mx", name: "@", preference: "10", exchange: "mail.example.net" },
    ]);
    expect(buildDomainPatch(delegated, editOf(delegated))).toEqual([]);
  });

  it("removes a record by its type, name and RDATA as received, and adds new ones to the list", () => {
    const edit = editOf(delegated);
    const records = [edit.records[1]!, edit.records[2]!, { type: "aaaa" as const, name: "ns1", address: "2001:db8::1" }, { type: "ns" as const, name: "@", nsdname: "ns2.example.net" }];
    expect(buildDomainPatch(delegated, { ...edit, records })).toEqual([
      { op: "remove", path: "/dns/records", match: { type: "NS", name: "@", rdata: { nsdname: "ns1.example.de" } } },
      { op: "add", path: "/dns/records", value: { "@type": "dnsRecord", name: "ns1", type: "aaaa", rdata: { address: "2001:db8::1" } } },
      { op: "add", path: "/dns/records", value: { "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns2.example.net" } } },
    ]);
  });

  it("adds the whole DNS data element when the domain has none, and switches from hosts to NS records in one patch", () => {
    const edit = { ...editOf(domain), nameservers: [], records: [{ type: "ns" as const, name: "@", nsdname: "a.nic.example" }] };
    expect(buildDomainPatch(domain, edit)).toEqual([
      { op: "remove", path: "/nameservers", match: { hostName: "ns1.example.test" } },
      { op: "remove", path: "/nameservers", match: { hostName: "ns2.example.test" } },
      { op: "add", path: "/dns", value: { "@type": "dnsData", records: [{ "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "a.nic.example" } }] } },
    ]);
  });

  it("leaves out records with a problem and the same record twice", () => {
    const edit = editOf(delegated);
    const bad = { type: "a" as const, name: "ns2", address: "2001:db8::1" };
    const twice = { type: "aaaa" as const, name: "ns1", address: "2001:db8::2" };
    expect(buildDomainPatch(delegated, { ...edit, records: [...edit.records, bad, twice, twice] })).toEqual([
      { op: "add", path: "/dns/records", value: { "@type": "dnsRecord", name: "ns1", type: "aaaa", rdata: { address: "2001:db8::2" } } },
    ]);
  });

  it("replaces an MX record with 0 .", () => {
    const edit = editOf(delegated);
    expect(buildDomainPatch(delegated, { ...edit, records: [edit.records[0]!, edit.records[1]!, { type: "mx", name: "@", preference: "0", exchange: "." }] })).toEqual([
      { op: "remove", path: "/dns/records", match: { type: "mx", name: "@", rdata: { preference: "10", exchange: "mail.example.net", future: "kept" } } },
      { op: "add", path: "/dns/records", value: { "@type": "dnsRecord", name: "@", type: "mx", rdata: { preference: "0", exchange: "." } } },
    ]);
  });

  it("describes record operations as DNS presentation lines", () => {
    expect(describePatchOperation({ op: "remove", path: "/dns/records", match: { type: "NS", name: "@", rdata: { nsdname: "ns1.example.de" } } })).toBe(
      "Remove DNS record @ NS ns1.example.de",
    );
    expect(describePatchOperation({ op: "add", path: "/dns/records", value: { name: "@", type: "mx", rdata: { preference: "10", exchange: "mx.example.net" } } })).toBe(
      "Add DNS record @ MX 10 mx.example.net",
    );
    expect(describePatchOperation({ op: "add", path: "/dns", value: { records: [{ name: "@", type: "ns", rdata: { nsdname: "a.example" } }] } })).toBe(
      "Add DNS data with @ NS a.example",
    );
    expect(describePatchOperation({ op: "remove", path: "/dns/records", match: { type: "txt", name: "@" } })).toBe("Remove DNS record @ TXT");
  });
});
