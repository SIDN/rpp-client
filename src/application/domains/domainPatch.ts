import { STATUS_VOCABULARIES } from "@/rpp/core/status/statuses";
import type { DomainName } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { dnsRecordInputOf, dnsRecordOf, describeRecord, editableRecordsOf, recordProblems, sameRecord, type DnsRecordInput } from "./dnsRecords";

export type AuthInfoEdit = { action: "keep" } | { action: "set"; value: string } | { action: "remove" };

/** What the Change form edits of a domain: the members a client may change, in the form they have there. */
export interface DomainEdit {
  /** Empty for none. */
  registrant: string;
  contacts: { label: string; id: string }[];
  nameservers: string[];
  /** The client statuses the domain should have; statuses set by the server are not part of it. */
  clientStatuses: string[];
  authInfo: AuthInfoEdit;
  /** The NS, A, AAAA and MX records of the DNS data; other records (DNSSEC among them) are not part of it and stay. */
  records: DnsRecordInput[];
}

export const CLIENT_STATUSES: readonly string[] = STATUS_VOCABULARIES.domainStatus.clientSettable;

export function editOf(domain: DomainName): DomainEdit {
  return {
    registrant: domain.registrant?.id ?? "",
    contacts: (domain.contacts ?? []).map(({ label, object }) => ({ label, id: object.id })),
    nameservers: (domain.nameservers ?? []).map((host) => host.hostName),
    clientStatuses: domain.status.map((status) => status.label).filter((label) => CLIENT_STATUSES.includes(label)),
    authInfo: { action: "keep" },
    records: editableRecordsOf(domain.dns?.records),
  };
}

const sameContact = (a: { label: string; id: string }, b: { label: string; id: string }) => a.label === b.label && a.id === b.id;

/**
 * The JSON Patch (json §5.2) that turns `current` into `edit`: one operation per element added or removed, so what
 * the form does not touch stays as the server has it. Empty when nothing changed.
 */
export function buildDomainPatch(current: DomainName, edit: DomainEdit): PatchOperation[] {
  const before = editOf(current);
  const operations: PatchOperation[] = [];

  const registrant = edit.registrant.trim();
  if (registrant !== before.registrant) {
    if (registrant === "") operations.push({ op: "remove", path: "/registrant" });
    else {
      const value = { "@type": "contact", id: registrant };
      operations.push(before.registrant === "" ? { op: "add", path: "/registrant", value } : { op: "replace", path: "/registrant", value });
    }
  }

  const wantedContacts = edit.contacts.map(({ label, id }) => ({ label: label.trim(), id: id.trim() })).filter(({ label, id }) => label && id);
  for (const contact of before.contacts) {
    if (!wantedContacts.some((wanted) => sameContact(wanted, contact))) {
      operations.push({ op: "remove", path: "/contacts", match: { label: contact.label, object: { id: contact.id } } });
    }
  }
  for (const contact of wantedContacts) {
    if (!before.contacts.some((known) => sameContact(known, contact))) {
      operations.push({ op: "add", path: "/contacts", value: { label: contact.label, object: { "@type": "contact", id: contact.id } } });
    }
  }

  const wantedHosts = [...new Set(edit.nameservers.map((host) => host.trim()).filter(Boolean))];
  for (const hostName of before.nameservers) {
    if (!wantedHosts.includes(hostName)) operations.push({ op: "remove", path: "/nameservers", match: { hostName } });
  }
  for (const hostName of wantedHosts) {
    if (!before.nameservers.includes(hostName)) operations.push({ op: "add", path: "/nameservers", value: { "@type": "host", hostName } });
  }

  for (const label of before.clientStatuses) {
    if (!edit.clientStatuses.includes(label)) operations.push({ op: "remove", path: "/status", match: { label } });
  }
  for (const label of edit.clientStatuses) {
    if (!before.clientStatuses.includes(label)) operations.push({ op: "add", path: "/status", value: { "@type": "domainStatus", label } });
  }

  operations.push(...recordOperations(current, edit.records));

  if (edit.authInfo.action === "set") {
    operations.push({ op: "add", path: "/authInfo", value: { "@type": "authInfo", method: "authinfo", authdata: edit.authInfo.value } });
  } else if (edit.authInfo.action === "remove") {
    operations.push({ op: "remove", path: "/authInfo" });
  }

  return operations;
}

/**
 * One `remove` per editable record that goes, matched by its type, name and RDATA as the server gave them, and one `add`
 * per record that comes. When the domain has no DNS data yet, the new records are added as the whole element. Records
 * with a problem are left out, for the form to flag.
 */
function recordOperations(current: DomainName, records: readonly DnsRecordInput[]): PatchOperation[] {
  const operations: PatchOperation[] = [];
  const had = current.dns?.records ?? [];
  const wanted = records.filter((record) => Object.keys(recordProblems(record, current.name)).length === 0);
  for (const record of had) {
    const input = dnsRecordInputOf(record);
    if (input && !wanted.some((entry) => sameRecord(entry, input))) {
      operations.push({ op: "remove", path: "/dns/records", match: { type: record.type, name: record.name, rdata: record.rdata } });
    }
  }
  const before = editableRecordsOf(had);
  const added: DnsRecordInput[] = [];
  for (const record of wanted) {
    if (!before.some((known) => sameRecord(known, record)) && !added.some((known) => sameRecord(known, record))) added.push(record);
  }
  if (added.length === 0) return operations;
  if (current.dns === undefined) {
    operations.push({ op: "add", path: "/dns", value: { "@type": "dnsData", records: added.map(dnsRecordOf) } });
  } else {
    for (const record of added) operations.push({ op: "add", path: "/dns/records", value: dnsRecordOf(record) });
  }
  return operations;
}

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});

/** One operation as a line a registrar can read before sending it. The password itself is never part of it. */
export function describePatchOperation(operation: PatchOperation): string {
  if (operation.path === "/dns/records" || operation.path === "/dns") return describeDnsOperation(operation);
  const subject = { "/registrant": "registrant", "/contacts": "contact", "/nameservers": "name server", "/status": "status", "/authInfo": "transfer password" }[operation.path] ?? operation.path;
  const detail = (source: unknown): string => {
    const record = asRecord(source);
    switch (operation.path) {
      case "/registrant":
        return String(record.id ?? "");
      case "/contacts":
        return `${String(record.label ?? "")} ${String(asRecord(record.object).id ?? "")}`.trim();
      case "/nameservers":
        return String(record.hostName ?? "");
      case "/status":
        return String(record.label ?? "");
      default:
        return "";
    }
  };
  switch (operation.op) {
    case "add":
      return operation.path === "/authInfo" ? "Set the transfer password" : `Add ${subject} ${detail(operation.value)}`.trim();
    case "replace":
      return `Replace the ${subject} with ${detail(operation.value)}`.trim();
    case "remove":
      return operation.path === "/authInfo" ? "Remove the transfer password" : operation.path === "/registrant" ? "Remove the registrant" : `Remove ${subject} ${detail(operation.match)}`.trim();
  }
}

const recordText = (value: unknown): string => {
  const record = asRecord(value);
  const input = dnsRecordInputOf({ "@type": "dnsRecord", name: String(record.name ?? ""), type: String(record.type ?? ""), rdata: asRecord(record.rdata) });
  return input ? describeRecord(input) : `${String(record.name ?? "")} ${String(record.type ?? "").toUpperCase()}`.trim();
};

function describeDnsOperation(operation: PatchOperation): string {
  if (operation.op === "remove") return operation.match ? `Remove DNS record ${recordText(operation.match)}` : "Remove the DNS data";
  const value = asRecord(operation.value);
  if (operation.path === "/dns") {
    const records = Array.isArray(value.records) ? value.records : [];
    return `Add DNS data with ${records.map(recordText).join(", ")}`;
  }
  return `${operation.op === "add" ? "Add" : "Replace with"} DNS record ${recordText(operation.value)}`;
}
