// Labels of the data objects draft (status tables, and the label enums of the JSON schema: the read view lists every
// value, the create view the client-settable ones). A server's Preset Schema is authoritative; these only describe.
export const STATUS_VOCABULARIES = {
  domainStatus: {
    read: [
      "clientDeleteProhibited", "serverDeleteProhibited", "clientHold", "serverHold", "clientRenewProhibited",
      "serverRenewProhibited", "clientTransferProhibited", "serverTransferProhibited", "clientUpdateProhibited",
      "serverUpdateProhibited", "inactive", "ok", "pendingCreate", "pendingDelete", "pendingRenew", "pendingTransfer",
      "pendingUpdate", "rgpAddPeriod", "rgpAutoRenewPeriod", "rgpRenewPeriod", "rgpTransferPeriod",
      "rgpRedemptionPeriod", "rgpPendingRestore", "rgpPendingDelete",
    ],
    clientSettable: [
      "clientDeleteProhibited", "clientHold", "clientRenewProhibited", "clientTransferProhibited",
      "clientUpdateProhibited",
    ],
  },
  hostStatus: {
    read: [
      "clientDeleteProhibited", "serverDeleteProhibited", "clientUpdateProhibited", "serverUpdateProhibited", "linked",
      "ok", "pendingCreate", "pendingDelete", "pendingTransfer", "pendingUpdate",
    ],
    clientSettable: ["clientDeleteProhibited", "clientUpdateProhibited"],
  },
  contactStatus: {
    read: [
      "clientDeleteProhibited", "serverDeleteProhibited", "clientTransferProhibited", "serverTransferProhibited",
      "clientUpdateProhibited", "serverUpdateProhibited", "linked", "ok", "pendingCreate", "pendingDelete",
      "pendingTransfer", "pendingUpdate",
    ],
    clientSettable: ["clientDeleteProhibited", "clientTransferProhibited", "clientUpdateProhibited"],
  },
  organisationStatus: {
    read: [
      "ok", "hold", "terminated", "linked", "clientLinkProhibited", "serverLinkProhibited", "clientUpdateProhibited",
      "serverUpdateProhibited", "clientDeleteProhibited", "serverDeleteProhibited", "pendingCreate", "pendingUpdate",
      "pendingDelete",
    ],
    clientSettable: ["hold", "terminated", "clientLinkProhibited", "clientUpdateProhibited", "clientDeleteProhibited"],
  },
  organisationRoleStatus: {
    read: ["clientLinkProhibited", "serverLinkProhibited", "linked", "ok"],
    clientSettable: ["clientLinkProhibited"],
  },
  userStatus: {
    read: ["active", "pending", "suspended", "deactivated"],
    clientSettable: ["suspended", "deactivated"],
  },
} as const satisfies Record<string, { read: readonly string[]; clientSettable: readonly string[] }>;

export type StatusType = keyof typeof STATUS_VOCABULARIES;
export type KnownStatusLabel<T extends StatusType> = (typeof STATUS_VOCABULARIES)[T]["read"][number];

const PENDING = "A transform command has been processed for the object, but the server has not completed the action.";

// Descriptions of the data objects draft, condensed. Keyed by label, or `type:label` where the draft differs per object.
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  clientDeleteProhibited: "Requests to delete the object are rejected.",
  serverDeleteProhibited: "Requests to delete the object are rejected.",
  clientHold: "DNS delegation information is not published for the object.",
  serverHold: "DNS delegation information is not published for the object.",
  clientRenewProhibited: "Requests to renew the object are rejected.",
  serverRenewProhibited: "Requests to renew the object are rejected.",
  clientTransferProhibited: "Requests to transfer the object are rejected.",
  serverTransferProhibited: "Requests to transfer the object are rejected.",
  clientUpdateProhibited: "Requests to update the object, other than to remove this status, are rejected.",
  serverUpdateProhibited: "Requests to update the object, other than to remove this status, are rejected.",
  inactive: "No delegation information is associated with the object.",
  ok: "The normal status of an object with no pending operations or prohibitions.",
  pendingCreate: PENDING,
  pendingDelete: PENDING,
  pendingRenew: PENDING,
  pendingTransfer: PENDING,
  pendingUpdate: PENDING,
  "hostStatus:pendingTransfer": "A transfer of the superordinate domain is pending.",
  "hostStatus:linked": "The host has at least one active association with another object, such as a domain.",
  rgpAddPeriod: "Grace period after the initial registration of a domain; deleting within it earns a credit.",
  rgpAutoRenewPeriod: "Grace period after an automatic renewal; deleting within it earns a credit.",
  rgpRenewPeriod: "Grace period after an explicit renewal; deleting within it earns a credit.",
  rgpTransferPeriod: "Grace period after a transfer; deleting within it earns a credit.",
  rgpRedemptionPeriod: "A delete was received and the domain can still be restored.",
  rgpPendingRestore: "The domain is being restored from the redemption period.",
  rgpPendingDelete: "The domain is in purge processing after the redemption period.",
};

export interface StatusDescription {
  /** The identifier as received; never replaced by a display text. */
  label: string;
  known: boolean;
  setBy: "client" | "server" | "unknown";
  description: string;
}

export function describeStatus(type: StatusType, label: string): StatusDescription {
  const vocabulary = STATUS_VOCABULARIES[type];
  const known = (vocabulary.read as readonly string[]).includes(label);
  if (!known) {
    // The draft names the prefixes as the client/server split; anything else could be an extension's.
    const setBy = label.startsWith("client") ? "client" : label.startsWith("server") ? "server" : "unknown";
    return { label, known, setBy, description: "Status value not defined by the data objects draft; shown as received." };
  }
  return {
    label,
    known,
    setBy: (vocabulary.clientSettable as readonly string[]).includes(label) ? "client" : "server",
    description: DESCRIPTIONS[`${type}:${label}`] ?? DESCRIPTIONS[label] ?? "No description is available in this client.",
  };
}

/** Values of enumerations outside the status objects, as the draft schema lists them. */
export const ENUMERATIONS = {
  transferStatus: ["pending", "clientApproved", "clientCancelled", "clientRejected", "serverApproved", "serverCancelled"],
  transferDirection: ["pull", "push"],
  restoreStatus: ["pendingRestore", "restored", "rgpPendingDelete"],
  messageStatus: ["queued", "delivered", "removed"],
  periodUnit: ["y", "m"],
} as const;

export type EnumerationName = keyof typeof ENUMERATIONS;

export const isKnownValue = (name: EnumerationName, value: string): boolean =>
  (ENUMERATIONS[name] as readonly string[]).includes(value);
