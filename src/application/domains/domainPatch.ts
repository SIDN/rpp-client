import { STATUS_VOCABULARIES } from "@/rpp/core/status/statuses";
import type { DnsData, DnsRecord, DomainName } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";

export type AuthInfoEdit = { action: "keep" } | { action: "set"; value: string } | { action: "remove" };

export type DnssecKind = "ds" | "dnskey";

/** The DNSSEC data of a domain as the form edits it: the rdata of its DS and DNSKEY records, and the maximum signature life in seconds. */
export interface DnssecEdit {
  ds: Record<string, string>[];
  keys: Record<string, string>[];
  /** Empty for none; whole seconds otherwise. */
  maxSigLife: string;
}

/** What the Change form edits of a domain: the members a client may change, in the form they have there. */
export interface DomainEdit {
  /** Empty for none. */
  registrant: string;
  contacts: { label: string; id: string }[];
  nameservers: string[];
  /** The client statuses the domain should have; statuses set by the server are not part of it. */
  clientStatuses: string[];
  authInfo: AuthInfoEdit;
  /** Left alone when undefined. */
  dnssec?: DnssecEdit;
}

export const CLIENT_STATUSES: readonly string[] = STATUS_VOCABULARIES.domainStatus.clientSettable;

const DNSSEC_KINDS: readonly DnssecKind[] = ["ds", "dnskey"];

const rdataOf = (record: DnsRecord): Record<string, string> =>
  Object.fromEntries(Object.entries(record.rdata ?? {}).map(([key, value]) => [key, String(value)]));

const dnssecRecords = (dns: DnsData | undefined, kind: DnssecKind) => (dns?.records ?? []).filter((record) => record.type.toLowerCase() === kind);

const maxSigLifetimeOf = (dns: DnsData | undefined): Record<string, number> => {
  const value = (dns?.controls as { maxSigLifetime?: unknown } | undefined)?.maxSigLifetime;
  return typeof value === "object" && value !== null ? (value as Record<string, number>) : {};
};

export function dnssecEditOf(domain: DomainName): DnssecEdit {
  const lifetime = maxSigLifetimeOf(domain.dns);
  const seconds = lifetime.ds ?? lifetime.dnskey;
  return {
    ds: dnssecRecords(domain.dns, "ds").map(rdataOf),
    keys: dnssecRecords(domain.dns, "dnskey").map(rdataOf),
    maxSigLife: seconds === undefined ? "" : String(seconds),
  };
}

export function editOf(domain: DomainName): DomainEdit {
  return {
    registrant: domain.registrant?.id ?? "",
    contacts: (domain.contacts ?? []).map(({ label, object }) => ({ label, id: object.id })),
    nameservers: (domain.nameservers ?? []).map((host) => host.hostName),
    clientStatuses: domain.status.map((status) => status.label).filter((label) => CLIENT_STATUSES.includes(label)),
    authInfo: { action: "keep" },
    dnssec: dnssecEditOf(domain),
  };
}

const sameRdata = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
};

const clean = (rdata: Record<string, string>) => Object.fromEntries(Object.entries(rdata).map(([key, value]) => [key, value.trim()]));
const filledRdata = (rdata: Record<string, string>) => Object.values(rdata).some((value) => value.trim() !== "");

/**
 * The operations that add and remove the DS or DNSKEY records of a domain and set its maximum signature life. Records
 * of other types stay as they are. A domain without DNS data gets it added whole; otherwise each record is one operation.
 */
function dnssecOperations(current: DomainName, wanted: DnssecEdit): PatchOperation[] {
  const before = dnssecEditOf(current);
  const hasDns = current.dns !== undefined;
  const added: DnsRecord[] = [];
  const removed: PatchOperation[] = [];

  for (const kind of DNSSEC_KINDS) {
    const old = kind === "ds" ? before.ds : before.keys;
    const next = (kind === "ds" ? wanted.ds : wanted.keys).filter(filledRdata).map(clean);
    for (const rdata of old) {
      if (!next.some((candidate) => sameRdata(candidate, rdata))) removed.push({ op: "remove", path: "/dns/records", match: { type: kind, rdata } });
    }
    for (const rdata of next) {
      if (!old.some((known) => sameRdata(known, rdata))) added.push({ "@type": "dnsRecord", name: "@", type: kind, rdata });
    }
  }

  const kind: DnssecKind | undefined = wanted.ds.some(filledRdata) ? "ds" : wanted.keys.some(filledRdata) ? "dnskey" : undefined;
  const seconds = Number(wanted.maxSigLife.trim());
  const lifetime = { ...maxSigLifetimeOf(current.dns) };
  for (const known of DNSSEC_KINDS) delete lifetime[known];
  if (kind && wanted.maxSigLife.trim() !== "" && Number.isInteger(seconds)) lifetime[kind] = seconds;
  const currentLifetime = maxSigLifetimeOf(current.dns);
  const lifetimeChanged =
    Object.keys(lifetime).length !== Object.keys(currentLifetime).length || Object.entries(lifetime).some(([key, value]) => currentLifetime[key] !== value);

  const controlsBefore = current.dns?.controls;
  const { maxSigLifetime: _dropped, ...otherControls } = (controlsBefore ?? {}) as Record<string, unknown>;
  void _dropped;
  const controls = { "@type": "dnsControls", ...otherControls, ...(Object.keys(lifetime).length > 0 && { maxSigLifetime: lifetime }) };
  const controlsEmpty = Object.keys(controls).length === 1;

  if (!hasDns) {
    if (added.length === 0 && !(lifetimeChanged && !controlsEmpty)) return [];
    return [{ op: "add", path: "/dns", value: { "@type": "dnsData", ...(added.length > 0 && { records: added }), ...(!controlsEmpty && { controls }) } }];
  }
  const operations: PatchOperation[] = [...removed, ...added.map((value): PatchOperation => ({ op: "add", path: "/dns/records", value }))];
  if (lifetimeChanged) {
    if (controlsEmpty) operations.push({ op: "remove", path: "/dns/controls" });
    else operations.push({ op: controlsBefore === undefined ? "add" : "replace", path: "/dns/controls", value: controls });
  }
  return operations;
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

  if (edit.dnssec) operations.push(...dnssecOperations(current, edit.dnssec));

  if (edit.authInfo.action === "set") {
    operations.push({ op: "add", path: "/authInfo", value: { "@type": "authInfo", method: "authinfo", authdata: edit.authInfo.value } });
  } else if (edit.authInfo.action === "remove") {
    operations.push({ op: "remove", path: "/authInfo" });
  }

  return operations;
}

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});

/** One operation as a line a registrar can read before sending it. The password itself is never part of it. */
export function describePatchOperation(operation: PatchOperation): string {
  const subject = { "/registrant": "registrant", "/contacts": "contact", "/nameservers": "name server", "/status": "status", "/authInfo": "transfer password", "/dns/records": "DNSSEC record", "/dns/controls": "DNS controls", "/dns": "DNS data" }[operation.path] ?? operation.path;
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
      case "/dns/records":
        return `${String(record.type ?? "").toUpperCase()} ${JSON.stringify(record.rdata ?? {})}`.trim();
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
