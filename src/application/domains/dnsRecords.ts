import { ipVersionOf } from "@/application/hosts/hostData";
import { t } from "@/i18n";
import { isAscii } from "@/rpp/core/idn";
import { isJsonObject } from "@/rpp/core/types/json";
import type { DnsRecord } from "@/rpp/core/types/objects";

/**
 * The records of a domain's DNS Data element (draft-ietf-rpp-data-objects §9.9, §11.2) that this client edits besides
 * DNSSEC: the delegation records NS, A and AAAA, which a server must support, and MX. Types are lowercase on the wire
 * (§9.9) and every RDATA value is a string in presentation format, its member named after the RFC field in camelCase:
 *
 * - NS: `nsdname` (RFC 1035 §3.3.11); A and AAAA: `address` (RFC 1035 §3.4.1, RFC 3596 §2.4, RFC 5952 text form).
 * - MX: `preference` and `exchange` (RFC 1035 §3.3.9). These names follow the camelCase rule of §9.9; the draft's
 *   list of RDATA structures does not show MX, so they are derived, not quoted.
 *
 * Other record types are left as the server has them.
 */
export const EDITABLE_RECORD_TYPES = ["ns", "a", "aaaa", "mx"] as const;
export type EditableRecordType = (typeof EDITABLE_RECORD_TYPES)[number];

/** NS, A and AAAA: the records that delegate a domain, which the draft does not allow next to name servers given as hosts (§11.2). */
export const DELEGATION_RECORD_TYPES: readonly EditableRecordType[] = ["ns", "a", "aaaa"];

export type DnsRecordInput =
  | { type: "ns"; name: string; nsdname: string }
  | { type: "a" | "aaaa"; name: string; address: string }
  | { type: "mx"; name: string; preference: string; exchange: string };

export const isEditableType = (type: unknown): type is EditableRecordType =>
  typeof type === "string" && (EDITABLE_RECORD_TYPES as readonly string[]).includes(type);

export const isDelegationType = (type: string): boolean => (DELEGATION_RECORD_TYPES as readonly string[]).includes(type);

/** The record as sent. Values are sent as entered, apart from surrounding whitespace. */
export function dnsRecordOf(input: DnsRecordInput): DnsRecord {
  const base = { "@type": "dnsRecord", name: input.name.trim(), type: input.type } as const;
  switch (input.type) {
    case "ns":
      return { ...base, rdata: { nsdname: input.nsdname.trim() } };
    case "a":
    case "aaaa":
      return { ...base, rdata: { address: input.address.trim() } };
    case "mx":
      return { ...base, rdata: { preference: input.preference.trim(), exchange: input.exchange.trim() } };
  }
}

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/**
 * The editable form of a record the server holds, or undefined for a record of another type, or one whose RDATA is
 * not what this client writes (so that it is left alone rather than rewritten). The type is matched without regard to
 * case, since a server could answer with uppercase types.
 */
export function dnsRecordInputOf(record: DnsRecord): DnsRecordInput | undefined {
  const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
  const rdata = isJsonObject(record.rdata) ? record.rdata : {};
  const name = str(record.name) ?? "";
  switch (type) {
    case "ns": {
      const nsdname = str(rdata.nsdname);
      return nsdname === undefined ? undefined : { type, name, nsdname };
    }
    case "a":
    case "aaaa": {
      const address = str(rdata.address);
      return address === undefined ? undefined : { type, name, address };
    }
    case "mx": {
      const preference = str(rdata.preference);
      const exchange = str(rdata.exchange);
      return preference === undefined || exchange === undefined ? undefined : { type, name, preference, exchange };
    }
    default:
      return undefined;
  }
}

/** The records of a domain that the client edits, as inputs, in the order the server gave them. */
export function editableRecordsOf(records: readonly DnsRecord[] | undefined): DnsRecordInput[] {
  return (records ?? []).flatMap((record) => dnsRecordInputOf(record) ?? []);
}

/** Whether two inputs describe the same record. Type and names compare without case, as DNS does. */
export function sameRecord(a: DnsRecordInput, b: DnsRecordInput): boolean {
  const ra = dnsRecordOf(a);
  const rb = dnsRecordOf(b);
  if (ra.type !== rb.type || ra.name.toLowerCase() !== rb.name.toLowerCase()) return false;
  const keys = new Set([...Object.keys(ra.rdata), ...Object.keys(rb.rdata)]);
  return [...keys].every((key) => String(ra.rdata[key]).toLowerCase() === String(rb.rdata[key]).toLowerCase());
}

const LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
const HOST_NAME = new RegExp(`^${LABEL}(?:\\.${LABEL})*\\.?$`);
const OWNER_LABEL = "(?:_?[A-Za-z0-9](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9])?|\\*)";
const OWNER_NAME = new RegExp(`^${OWNER_LABEL}(?:\\.${OWNER_LABEL})*\\.?$`);

export type RecordField = "name" | "nsdname" | "address" | "preference" | "exchange";

/**
 * What the draft says of a record's owner name (§9.9, §11.2): `@` for the domain, a name relative to it, or an absolute
 * name with a trailing dot, which must be the domain itself or below it. Undefined when it is acceptable.
 */
export function ownerNameProblem(name: string, domain: string): string | undefined {
  const owner = name.trim();
  if (owner === "") return t("domains.dnsRecords.errors.emptyOwner");
  if (owner === "@") return undefined;
  if (!isAscii(owner)) return t("domains.dnsRecords.errors.useALabel");
  if (!OWNER_NAME.test(owner)) return t("domains.dnsRecords.errors.notDnsName");
  if (owner.endsWith(".") && domain.trim() !== "") {
    const apex = `${domain.trim().replace(/\.$/, "")}.`.toLowerCase();
    const absolute = owner.toLowerCase();
    if (absolute !== apex && !absolute.endsWith(`.${apex}`)) return t("domains.dnsRecords.errors.outsideDomain", { apex });
  }
  return undefined;
}

const hostNameProblem = (value: string): string | undefined => {
  const host = value.trim();
  if (host === "") return t("domains.dnsRecords.errors.emptyHost");
  if (!isAscii(host)) return t("domains.dnsRecords.errors.useALabel");
  return HOST_NAME.test(host) ? undefined : t("domains.dnsRecords.errors.notHostName");
};

/**
 * The problems of one record, by field, before it is sent. `domain` is the A-label of the domain the record belongs
 * to; empty when not known yet, in which case absolute owner names are not checked against it.
 */
export function recordProblems(input: DnsRecordInput, domain: string): Partial<Record<RecordField, string>> {
  const problems: Partial<Record<RecordField, string>> = {};
  const owner = ownerNameProblem(input.name, domain);
  if (owner) problems.name = owner;
  switch (input.type) {
    case "ns": {
      const problem = hostNameProblem(input.nsdname);
      if (problem) problems.nsdname = problem;
      break;
    }
    case "a":
    case "aaaa": {
      const wanted = input.type === "a" ? 4 : 6;
      const version = ipVersionOf(input.address);
      if (version !== wanted) problems.address = input.type === "a" ? t("domains.dnsRecords.errors.ipv4") : t("domains.dnsRecords.errors.ipv6");
      break;
    }
    case "mx": {
      const preference = input.preference.trim();
      if (!/^\d{1,5}$/.test(preference) || Number(preference) > 65535) problems.preference = t("domains.dnsRecords.errors.preference");
      // The root `.` is a valid exchange: `0 .` is the null MX of RFC 7505.
      const problem = input.exchange.trim() === "." ? undefined : hostNameProblem(input.exchange);
      if (problem) problems.exchange = problem;
      break;
    }
  }
  return problems;
}

/** One record as a line a registrar can read, in DNS presentation order. */
export function describeRecord(input: DnsRecordInput): string {
  const record = dnsRecordOf(input);
  const data = input.type === "mx" ? `${record.rdata.preference} ${record.rdata.exchange}` : String(Object.values(record.rdata)[0]);
  return `${record.name} ${input.type.toUpperCase()} ${data}`;
}
