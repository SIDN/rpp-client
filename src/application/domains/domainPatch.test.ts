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
