import { STATUS_VOCABULARIES } from "@/rpp/core/status/statuses";
import type { DomainName } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";

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
}

export const CLIENT_STATUSES: readonly string[] = STATUS_VOCABULARIES.domainStatus.clientSettable;

export function editOf(domain: DomainName): DomainEdit {
  return {
    registrant: domain.registrant?.id ?? "",
    contacts: (domain.contacts ?? []).map(({ label, object }) => ({ label, id: object.id })),
    nameservers: (domain.nameservers ?? []).map((host) => host.hostName),
    clientStatuses: domain.status.map((status) => status.label).filter((label) => CLIENT_STATUSES.includes(label)),
    authInfo: { action: "keep" },
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
