import type { RriDomainEdit, RriTransferInput } from "@/application/extensions/denicRri/rriDomain";
import { requestContactOf } from "@/application/extensions/denicRri/rriDomain";
import type { DomainName } from "@/rpp/core/types/objects";
import { recordInputsOf, type DnsRecordValues } from "@/features/domains/dnsRecordValues";
import { dnssecOf, DNSSEC_DEFAULTS, type DnssecValues } from "@/features/domains/DnssecFields";

/** The values a form holding the request contacts of a domain has. */
export type RequestContactValues = RriDomainEdit;

export const REQUEST_CONTACT_DEFAULTS: RequestContactValues = { generalRequest: "", abuse: "" };

/**
 * What the transfer form holds for the data DENIC RRI asks for with a transfer request. The DNS records use the fields
 * of a registration; `nameservers` stays empty, as hosts cannot be given here, and is there for those fields' checks.
 */
export interface RriTransferValues extends RequestContactValues, DnsRecordValues, DnssecValues {
  rriRegistrant: string;
  rriHolders: { id: string }[];
  nameservers: { host: string }[];
}

export const RRI_TRANSFER_DEFAULTS: RriTransferValues = {
  ...REQUEST_CONTACT_DEFAULTS,
  ...DNSSEC_DEFAULTS,
  rriRegistrant: "",
  rriHolders: [],
  nameservers: [],
  dnsRecords: [{ type: "ns", name: "@", value: "", preference: "" }],
};

export function rriTransferInputOf(values: RriTransferValues): RriTransferInput {
  // Only DNSKEY can be added in the transfer form (`DnssecFields kinds`).
  const dnssec = dnssecOf({ ...values, dsRecords: [] });
  return {
    registrant: values.rriRegistrant,
    holders: values.rriHolders.map(({ id }) => id),
    generalRequest: values.generalRequest,
    abuse: values.abuse,
    records: recordInputsOf(values.dnsRecords),
    dnskeys: dnssec?.type === "dnskey" ? dnssec.records : [],
  };
}

/** The request-contact members of a domain its details show as rows: those that are absent or hold a reference. */
export function rriMembersShown(domain: DomainName): string[] {
  return (["generalRequest", "abuse"] as const).filter((member) => domain[member] === undefined || requestContactOf(domain, member) !== undefined);
}
