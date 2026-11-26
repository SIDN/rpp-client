import type { ContactReference, DnsData, Identifier, LabelledReference, ProvMetadata, RppObject } from "../../../core/types/objects";

// The objects of the DENIC RRI extension 0.2.0 (§JSON Schema). They are kept here, not in the core types.

/** `ext.rri.requestContact.reference` */
export type RequestContactReference = RppObject<"requestContact", { id: Identifier }>;

/** `ext.rri.requestContact.read` */
export type RequestContact = RppObject<"requestContact", { id: Identifier; provMetadata: ProvMetadata; uriTemplate: string }>;

/** `ext.rri.requestContact.create` */
export type RequestContactCreate = RppObject<"requestContact", { id: Identifier; uriTemplate: string }>;

/** `ext.rri.requestContact.update` (full update); the identifier is create-only and not part of it. */
export type RequestContactUpdate = RppObject<"requestContact", { uriTemplate: string }>;

/** `ext.rri.requestContactAvailability.read` */
export type RequestContactAvailability = RppObject<"requestContactAvailability", { available: boolean; reason?: string }>;

/** The members the extension adds to the create, read and update views of a domain name. */
export type RriDomainMembers = {
  generalRequest?: RequestContactReference;
  abuse?: RequestContactReference;
};

/** The input data elements the extension adds to a domain transfer request (`ext.rri.domainTransferProcess.create`). */
export type RriTransferMembers = RriDomainMembers & {
  registrant: ContactReference;
  contacts?: LabelledReference<ContactReference>[];
  dns: DnsData;
};
