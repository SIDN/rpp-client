import type { ENUMERATIONS, KnownStatusLabel } from "../status/statuses";

export type Timestamp = string;
export type Identifier = string;
export type ClientIdentifier = string;

/** A known value or any other string: the server may send values this client does not know, and they are kept. */
export type OpenEnum<Known extends string> = Known | (string & Record<never, never>);

/** Every RPP object has `@type` (json §4.9.2). Members this client does not model stay reachable through the index signature. */
export type RppObject<Type extends string = string, Members extends object = object> = { "@type": Type } & Members & {
  [member: string]: unknown;
};

/** An object whose type this client does not model. */
export type UnknownRppObject = RppObject<string>;

type Enumeration<N extends keyof typeof ENUMERATIONS> = OpenEnum<(typeof ENUMERATIONS)[N][number]>;

// Component objects

export type StatusObject<Type extends string, Label extends string> = RppObject<
  Type,
  { label: OpenEnum<Label>; reason?: string; due?: Timestamp }
>;
export type DomainStatus = StatusObject<"domainStatus", KnownStatusLabel<"domainStatus">>;
export type HostStatus = StatusObject<"hostStatus", KnownStatusLabel<"hostStatus">>;
export type ContactStatus = StatusObject<"contactStatus", KnownStatusLabel<"contactStatus">>;
export type OrganisationStatus = StatusObject<"organisationStatus", KnownStatusLabel<"organisationStatus">>;
export type OrganisationRoleStatus = StatusObject<"organisationRoleStatus", KnownStatusLabel<"organisationRoleStatus">>;
export type UserStatus = StatusObject<"userStatus", KnownStatusLabel<"userStatus">>;

export type ProvMetadata = RppObject<
  "provMetadata",
  {
    repositoryId?: Identifier;
    spClientId: ClientIdentifier;
    crClientId?: ClientIdentifier;
    crDate?: Timestamp;
    upClientId?: ClientIdentifier;
    upDate?: Timestamp;
    trDate?: Timestamp;
  }
>;

export type Period = RppObject<"period", { value: number; unit: Enumeration<"periodUnit"> }>;

export type DnsRecord = RppObject<
  "dnsRecord",
  { name: string; class?: string; type: string; rdata: Record<string, unknown> }
>;
export type DnsData = RppObject<"dnsData", { records?: DnsRecord[]; controls?: RppObject<"dnsControls"> }>;

/** Authorisation information; a request carries it in the RPP-Authorization header, not in the body (json §4.9.3). */
export type AuthInfo = RppObject<"authInfo", { method: string; authdata: string }>;

export type LabelledReference<Reference> = { label: string; object: Reference };

// References: the limited representation of an aggregated object (json §4.10, view `reference`)

export type DomainNameReference = RppObject<"domainName", { name: string }>;
export type HostReference = RppObject<"host", { hostName: string }>;
export type ContactReference = RppObject<"contact", { id: Identifier }>;
export type OrganisationReference = RppObject<"organisation", { id: Identifier }>;
export type UserReference = RppObject<"user", { id: Identifier }>;
export type MessageReference = RppObject<"message", { id: Identifier }>;

// Processes

export type ProcessReference = RppObject<string, { processId: string }>;

export type Processes = RppObject<
  "processes",
  {
    transferProcess?: ProcessReference[];
    renewProcess?: ProcessReference[];
    restoreProcess?: ProcessReference[];
    createProcess?: ProcessReference[];
  }
>;

export type RestoreReport = RppObject<
  "restoreReport",
  {
    preData?: string;
    postData?: string;
    deleteTime?: Timestamp;
    restoreTime?: Timestamp;
    restoreReason?: string;
    statements: string[];
    other?: string;
  }
>;

export type TransferProcess = RppObject<
  "transferProcess" | "domainTransferProcess",
  {
    processId?: string;
    transferDir?: Enumeration<"transferDirection">;
    gainingClientId?: ClientIdentifier;
    trStatus: Enumeration<"transferStatus">;
    reqClientId: ClientIdentifier;
    requestDate: Timestamp;
    actClientId: ClientIdentifier;
    actionDate: Timestamp;
    expiryDate?: Timestamp;
    transferPeriod?: Period;
  }
>;
export type RenewProcess = RppObject<"renewProcess", { processId?: string; expiryDate?: Timestamp; renewalPeriod?: Period }>;
export type RestoreProcess = RppObject<
  "restoreProcess",
  {
    processId?: string;
    restoreStatus: Enumeration<"restoreStatus">;
    requestDate?: Timestamp;
    reportDate?: Timestamp;
    reportDueDate?: Timestamp;
    restoreReport?: RestoreReport;
  }
>;
export type CreateProcess = RppObject<"createProcess" | "domainCreateProcess", { processId?: string; period?: Period }>;

// Resource objects, read view

export type DomainName = RppObject<
  "domainName",
  {
    name: string;
    uName?: string;
    lgr?: string;
    provMetadata: ProvMetadata;
    status: DomainStatus[];
    registrant?: ContactReference;
    contacts?: LabelledReference<ContactReference>[];
    nameservers?: HostReference[];
    dns?: DnsData;
    subordinateHosts?: HostReference[];
    expiryDate?: Timestamp;
    authInfo?: AuthInfo;
    processes?: Processes;
  }
>;

export type Host = RppObject<
  "host",
  { hostName: string; provMetadata: ProvMetadata; status: HostStatus[]; dns?: DnsData; processes?: Processes }
>;

export type Contact = RppObject<
  "contact",
  {
    id: Identifier;
    provMetadata: ProvMetadata;
    status: ContactStatus[];
    /** A JSContact Card (RFC 9553); not modelled here. */
    contactInfo: Record<string, unknown>;
    disclose?: RppObject<"disclose">;
    authInfo?: AuthInfo;
    processes?: Processes;
  }
>;

export type Organisation = RppObject<
  "organisation",
  {
    id: Identifier;
    provMetadata: ProvMetadata;
    status: OrganisationStatus[];
    roles: Record<string, unknown>;
    parent?: OrganisationReference;
    contactInfo?: Record<string, unknown>;
    contacts?: LabelledReference<ContactReference>[];
    users?: LabelledReference<UserReference>[];
    processes?: Processes;
  }
>;

export type User = RppObject<
  "user",
  {
    id: Identifier;
    details: Record<string, unknown>;
    description?: string;
    status: UserStatus;
    organisation: OrganisationReference;
    processes?: Processes;
  }
>;

// Messages

type MessageSubject = { objectType?: string; objectId?: string };

export type ReviewResponseMessage = RppObject<
  "reviewResponseMessage",
  MessageSubject & {
    approved: boolean;
    clientTransactionId?: string;
    serverTransactionId: string;
    completionDate: Timestamp;
    message: string;
    process?: UnknownRppObject;
  }
>;
export type TransferRequestMessage = RppObject<
  "transferRequestMessage",
  MessageSubject & { status: string; requestDate: Timestamp; actionDate?: Timestamp; process?: UnknownRppObject }
>;
export type TransferOutcomeMessage = RppObject<
  "transferOutcomeMessage",
  MessageSubject & {
    trStatus: Enumeration<"transferStatus">;
    requestDate: Timestamp;
    actionDate: Timestamp;
    expiryDate?: Timestamp;
    process?: UnknownRppObject;
  }
>;
export type ExpirationDeletionMessage = RppObject<"expirationDeletionMessage", MessageSubject & { deletionDate: Timestamp }>;
export type AutoRenewalMessage = RppObject<
  "autoRenewalMessage",
  MessageSubject & { renewalDate: Timestamp; expiryDate: Timestamp }
>;
export type ServiceNoticeMessage = RppObject<"serviceNoticeMessage", MessageSubject & { message: string }>;

export type KnownMessageData =
  | ReviewResponseMessage
  | TransferRequestMessage
  | TransferOutcomeMessage
  | ExpirationDeletionMessage
  | AutoRenewalMessage
  | ServiceNoticeMessage;

/** Narrow on `@type`; a type this client does not know is an `UnknownRppObject`. */
export type MessageData = KnownMessageData | UnknownRppObject;

export type Message = RppObject<
  "message",
  { id: Identifier; creationDate: Timestamp; status: Enumeration<"messageStatus">; data: MessageData }
>;

export type Availability<Type extends string> = RppObject<Type, { available: boolean; reason?: string }>;

// Request views: only members a client may send. Read-only members are absent from them (json §4.4).

export type DomainNameCreate = RppObject<
  "domainName",
  {
    name: string;
    uName?: string;
    lgr?: string;
    status?: RppObject<"domainStatus", { label: string; reason?: string; due?: Timestamp }>[];
    registrant?: ContactReference;
    contacts?: LabelledReference<ContactReference>[];
    nameservers?: HostReference[];
    dns?: DnsData;
    authInfo?: AuthInfo;
    /** A create request carries the inputs of its create process, such as the registration period. */
    processes?: RppObject<"processes", { createProcess?: RppObject<"domainCreateProcess", { period?: Period }>[] }>;
  }
>;
export type DomainNameUpdate = RppObject<
  "domainName",
  {
    status?: RppObject<"domainStatus", { label: string; reason?: string; due?: Timestamp }>[];
    registrant?: ContactReference;
    contacts?: LabelledReference<ContactReference>[];
    nameservers?: HostReference[];
    dns?: DnsData;
  }
>;

export type HostCreate = RppObject<
  "host",
  { hostName: string; status?: RppObject<"hostStatus", { label: string; reason?: string }>[]; dns?: DnsData }
>;
export type HostUpdate = HostCreate;

export type ContactCreate = RppObject<
  "contact",
  {
    id: Identifier;
    status?: RppObject<"contactStatus", { label: string; reason?: string }>[];
    contactInfo: Record<string, unknown>;
    disclose?: RppObject<"disclose">;
    authInfo?: AuthInfo;
  }
>;
export type ContactUpdate = RppObject<
  "contact",
  {
    status?: RppObject<"contactStatus", { label: string; reason?: string }>[];
    contactInfo: Record<string, unknown>;
    disclose?: RppObject<"disclose">;
  }
>;

export type OrganisationCreate = RppObject<
  "organisation",
  {
    id: Identifier;
    status?: RppObject<"organisationStatus", { label: string; reason?: string }>[];
    roles: Record<string, unknown>;
    parent?: OrganisationReference;
    contactInfo?: Record<string, unknown>;
    contacts?: LabelledReference<ContactReference>[];
    users?: LabelledReference<UserReference>[];
  }
>;
export type OrganisationUpdate = RppObject<
  "organisation",
  {
    status?: RppObject<"organisationStatus", { label: string; reason?: string }>[];
    roles: Record<string, unknown>;
    parent?: OrganisationReference;
    contactInfo?: Record<string, unknown>;
    contacts?: LabelledReference<ContactReference>[];
    users?: LabelledReference<UserReference>[];
  }
>;

export type UserCreate = RppObject<
  "user",
  {
    id: Identifier;
    details: Record<string, unknown>;
    description?: string;
    status?: RppObject<"userStatus", { label: string; reason?: string }>;
  }
>;
export type UserUpdate = RppObject<
  "user",
  {
    details: Record<string, unknown>;
    description?: string;
    status?: RppObject<"userStatus", { label: string; reason?: string }>;
  }
>;
