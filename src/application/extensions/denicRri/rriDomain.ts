import { t } from "@/i18n";
import { isJsonObject } from "@/rpp/core/types/json";
import type { DomainName } from "@/rpp/core/types/objects";
import type { DnsRecordInput } from "@/application/domains/dnsRecords";
import { dnsDataOf, type DnskeyRdata } from "@/application/domains/domainWorkflows";
import type { RequestContactReference, RriDomainMember, RriDomainMembers, RriTransferMembers } from "@/rpp/extensions/modules/denicRri";
import { RRI_DOMAIN_MEMBERS } from "@/rpp/extensions/modules/denicRri";
import type { PatchOperation } from "@/rpp/operations/patch";
import { invalidRequest } from "@/rpp/operations/paths";

/** The request contacts of a domain as a form edits them: the handles, empty for none. */
export type RriDomainEdit = Record<RriDomainMember, string>;

export const EMPTY_RRI_EDIT: RriDomainEdit = { generalRequest: "", abuse: "" };

const reference = (id: string): RequestContactReference => ({ "@type": "requestContact", id });

/** The handle a domain refers to as its General Request or Abuse contact; undefined when it has none or it is no reference. */
export function requestContactOf(domain: DomainName, member: RriDomainMember): string | undefined {
  const value: unknown = domain[member];
  return isJsonObject(value) && value["@type"] === "requestContact" && typeof value.id === "string" ? value.id : undefined;
}

export function rriEditOf(domain: DomainName): RriDomainEdit {
  return { generalRequest: requestContactOf(domain, "generalRequest") ?? "", abuse: requestContactOf(domain, "abuse") ?? "" };
}

/** The members of a domain create request; a handle left empty is not sent. */
export function rriDomainMembers(edit: RriDomainEdit): RriDomainMembers {
  const members: RriDomainMembers = {};
  for (const member of RRI_DOMAIN_MEMBERS) {
    const id = edit[member].trim();
    if (id !== "") members[member] = reference(id);
  }
  return members;
}

/**
 * The JSON Patch operations (json §5.2) that set, replace or remove the request contacts of a domain, as in the
 * extension's example of a partial update. Empty when nothing changed.
 */
export function buildRriDomainPatch(current: DomainName, edit: RriDomainEdit): PatchOperation[] {
  const operations: PatchOperation[] = [];
  for (const member of RRI_DOMAIN_MEMBERS) {
    const before = requestContactOf(current, member) ?? "";
    const wanted = edit[member].trim();
    if (wanted === before) continue;
    if (wanted === "") operations.push({ op: "remove", path: `/${member}` });
    // A value that is there but is no reference is replaced, not added next to.
    else operations.push({ op: current[member] === undefined ? "add" : "replace", path: `/${member}`, value: reference(wanted) });
  }
  return operations;
}

/** One of the operations of `buildRriDomainPatch` as a line to read before sending; undefined for any other operation. */
export function describeRriPatchOperation(operation: PatchOperation): string | undefined {
  const subject =
    operation.path === "/generalRequest" ? t("rri.patch.generalRequest") : operation.path === "/abuse" ? t("rri.patch.abuse") : undefined;
  if (subject === undefined) return undefined;
  if (operation.op === "remove") return t("domains.patch.remove", { subject, detail: "" }).trim();
  const id = isJsonObject(operation.value) && typeof operation.value.id === "string" ? operation.value.id : "";
  return operation.op === "add" ? t("domains.patch.add", { subject, detail: id }) : t("domains.patch.replace", { subject, detail: id });
}

export interface RriTransferInput {
  /** The first holder; required (§Create (Transfer Request)). */
  registrant: string;
  /** The holders after the first; each is sent with the label `registrant`. */
  holders: readonly string[];
  generalRequest: string;
  abuse: string;
  /**
   * The NS, A, AAAA and MX records of the domain's DNS data, sent as entered apart from surrounding whitespace, as for a
   * registration (`application/domains/dnsRecords.ts`).
   */
  records: readonly DnsRecordInput[];
  /** DNSKEY records; the extension allows no DS records in a transfer request. */
  dnskeys: readonly DnskeyRdata[];
}

/**
 * The input data elements DENIC RRI adds to a domain transfer request: the domain as the gaining client holds it after
 * the transfer. `registrant` and `dns` are required; the server completes the transfer at once.
 */
export function rriTransferMembers(domain: string, input: RriTransferInput): RriTransferMembers {
  const registrant = input.registrant.trim();
  if (registrant === "") throw invalidRequest(t("rri.transfer.registrantRequired"));
  const holders = input.holders.map((id) => id.trim()).filter(Boolean);
  // The record types are those §Create (Transfer Request) allows: ns, a, aaaa, mx and dnskey. Each record is checked
  // as for a registration and refused before sending when it has a problem.
  const dns = dnsDataOf(domain, input.dnskeys.length > 0 ? { type: "dnskey", records: input.dnskeys } : undefined, input.records);
  return {
    registrant: { "@type": "contact", id: registrant },
    ...(holders.length > 0 && { contacts: holders.map((id) => ({ label: "registrant", object: { "@type": "contact", id } })) }),
    ...rriDomainMembers({ generalRequest: input.generalRequest, abuse: input.abuse }),
    // `dns` is required, also without records.
    dns: dns ?? { "@type": "dnsData" },
  };
}
