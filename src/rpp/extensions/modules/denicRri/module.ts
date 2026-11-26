import type { RppExtensionModule } from "../../ExtensionModule";

/** The members the extension adds to the Domain Name Data Object (DENIC RRI extension §Domain Name Data Object). */
export const RRI_DOMAIN_MEMBERS = ["generalRequest", "abuse"] as const;
export type RriDomainMember = (typeof RRI_DOMAIN_MEMBERS)[number];

/**
 * DENIC RRI, version 0.2.0 (draft-kowalik-rpp-denic-rri-00): the Request Contact Data Object, the General Request and
 * Abuse contacts of a domain name, and the data of the domain in a transfer request.
 */
export const DENIC_RRI: RppExtensionModule = {
  id: "de.denic.rpp.rri",
  displayName: "DENIC RRI",
  supportedVersions: ["0.2.0"],
  objects: ["requestContact"],
  addedMembers: { domainName: RRI_DOMAIN_MEMBERS },
  specification: "https://github.com/pawel-kow/ietf-rpp-api-epp-proxy-python/blob/main/docs/rri/rri-extension.md",
  schemaId: "https://github.com/pawel-kow/ietf-rpp-api-epp-proxy-python/blob/main/.spec/rri-extension.schema.json",
};

/** Every definition of the extension's schema has this prefix (§JSON Schema). */
export const RRI_SCHEMA_PREFIX = "ext.rri.";

/**
 * The only label of the `contacts` of a domain name under the extension: the holders after the first (§Domain Name Data
 * Object). `generalRequest` and `abuse` are members of their own, and a server rejects them as labels.
 */
export const RRI_CONTACT_LABELS = ["registrant"] as const;

/** The record types a transfer request may carry in its DNS data (§Create (Transfer Request)). */
export const RRI_TRANSFER_RECORD_TYPES = ["ns", "a", "aaaa", "mx", "dnskey"] as const;
