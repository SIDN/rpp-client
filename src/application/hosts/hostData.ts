import { STATUS_VOCABULARIES } from "@/rpp/core/status/statuses";
import { t } from "@/i18n";
import { toALabel } from "@/rpp/core/idn";
import { isJsonObject } from "@/rpp/core/types/json";
import type { DnsRecord, Host } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";

export const HOST_CLIENT_STATUSES: readonly string[] = STATUS_VOCABULARIES.hostStatus.clientSettable;

export type IpVersion = 4 | 6;

/** Which kind of IP address this is, or undefined when it is neither a dotted IPv4 address nor an IPv6 address. */
export function ipVersionOf(input: string): IpVersion | undefined {
  const address = input.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) {
    return address.split(".").every((part) => Number(part) <= 255 && (part.length === 1 || !part.startsWith("0"))) ? 4 : undefined;
  }
  if (!address.includes(":") || !/^[0-9a-fA-F:.]+$/.test(address)) return undefined;
  try {
    new URL(`http://[${address}]/`);
    return 6;
  } catch {
    return undefined;
  }
}

/** An address as a host holds it: the type of its DNS record as the server wrote it, and the address. */
export interface AddressRecord {
  type: string;
  address: string;
}

/** The addresses of a host, from its `A` and `AAAA` records in the order the server gave them; its other records are not addresses. */
export function addressRecordsOf(host: Host): AddressRecord[] {
  return (host.dns?.records ?? []).flatMap((record) => {
    const type = typeof record.type === "string" ? record.type : "";
    const address = isJsonObject(record.rdata) ? record.rdata.address : undefined;
    return ["a", "aaaa"].includes(type.toLowerCase()) && typeof address === "string" ? [{ type, address }] : [];
  });
}

export const addressesOf = (host: Host): string[] => addressRecordsOf(host).map((record) => record.address);

/** Trimmed, without blanks and without the same address twice. */
export function cleanAddresses(addresses: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of addresses) {
    const address = entry.trim();
    if (address === "" || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    result.push(address);
  }
  return result;
}

/** The record every host has for itself, which a request has to state as well (the draft's read view always has it). */
export const nsRecordOf = (hostName: string): DnsRecord => ({ "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: `${hostName}.` } });

/** The glue record of one address. Only for an address `ipVersionOf` knows. */
export const addressRecordOf = (hostName: string, address: string): DnsRecord => ({
  "@type": "dnsRecord",
  name: `${hostName}.`,
  type: ipVersionOf(address) === 6 ? "aaaa" : "a",
  rdata: { address },
});

/** What the Change form edits of a host: a new name, the addresses and the statuses the client sets. Other records are left alone. */
export interface HostEdit {
  /** Empty to keep the name. */
  newName: string;
  addresses: string[];
  clientStatuses: string[];
}

export function editOf(host: Host): HostEdit {
  return {
    newName: "",
    addresses: addressesOf(host),
    clientStatuses: host.status.map((status) => status.label).filter((label) => HOST_CLIENT_STATUSES.includes(label)),
  };
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The JSON Patch (json §5.2) that turns `current` into `edit`: a rename, one operation for each address added or removed
 * (the records stay under the name the host has now), and each client status added or removed. Empty when nothing
 * changed. An address that is not an IP address is left out, for the form to flag.
 */
export function buildHostPatch(current: Host, edit: HostEdit): PatchOperation[] {
  const operations: PatchOperation[] = [];

  const wantedName = edit.newName.trim() === "" ? undefined : toALabel(edit.newName.trim());
  if (wantedName && wantedName.toLowerCase() !== current.hostName.toLowerCase()) {
    operations.push({ op: "replace", path: "/hostName", value: wantedName });
  }

  const had = addressRecordsOf(current);
  const wanted = cleanAddresses(edit.addresses);
  for (const record of had) {
    if (!wanted.some((address) => sameAddress(address, record.address))) {
      operations.push({ op: "remove", path: "/dns/records", match: { type: record.type, rdata: { address: record.address } } });
    }
  }
  for (const address of wanted) {
    if (ipVersionOf(address) !== undefined && !had.some((record) => sameAddress(record.address, address))) {
      operations.push({ op: "add", path: "/dns/records", value: addressRecordOf(current.hostName, address) });
    }
  }

  const hadStatuses = editOf(current).clientStatuses;
  for (const label of hadStatuses) {
    if (!edit.clientStatuses.includes(label)) operations.push({ op: "remove", path: "/status", match: { label } });
  }
  for (const label of edit.clientStatuses) {
    if (!hadStatuses.includes(label)) operations.push({ op: "add", path: "/status", value: { "@type": "hostStatus", label } });
  }
  return operations;
}

const record = (value: unknown): Record<string, unknown> => (isJsonObject(value) ? value : {});

/** One operation as a line a registrar can read before sending it. */
export function describeHostOperation(operation: PatchOperation): string {
  if (operation.path === "/hostName" && operation.op === "replace") return t("hosts.change.rename", { name: String(operation.value) });
  if (operation.path === "/status") {
    const label = operation.op === "remove" ? record("match" in operation ? operation.match : undefined).label : record("value" in operation ? operation.value : undefined).label;
    return operation.op === "remove" ? t("hosts.change.removeStatus", { label: String(label) }) : t("hosts.change.addStatus", { label: String(label) });
  }
  if (operation.path === "/dns/records") {
    const source = operation.op === "remove" ? ("match" in operation ? operation.match : undefined) : "value" in operation ? operation.value : undefined;
    const address = String(record(record(source).rdata).address);
    return operation.op === "remove" ? t("hosts.change.removeAddress", { address }) : t("hosts.change.addAddress", { address });
  }
  return `${operation.op} ${operation.path}`;
}
