import type { ResourceType } from "../core/types/resources";

export type ProcessKind = "create" | "renew" | "restore" | "transfer";

export type ProcessOperation = "list" | "create" | "read" | "update" | "delete" | "transferApprove" | "transferReject";

export interface ProcessDefinition {
  /** Collection segment below `{resource}/processes/` (core Rule 3). */
  segment: string;
  /** Identifier of the process object, which names its schema definitions. */
  objectType: string;
  /** The operations the target server's contract has for this process (core Rule 4 and 5 applied to its OpenAPI). */
  operations: readonly ProcessOperation[];
}

export interface ResourceDefinition {
  /** The `@type` of the object: a resource type of the drafts, or the identifier of an object an extension defines. */
  type: ResourceType | (string & {});
  /**
   * Prefix of the schema definitions of the object, such as `domainName` in `domainName.read`; the type when absent. An
   * extension's object has the prefix of its schema (json §7), such as `ext.rri.requestContact`.
   */
  schemaPrefix?: string;
  /** Collection segment (core Rule 1); for a user it is relative to its organisation. */
  collection: string;
  /** Identifier of the Availability Object, when the resource has an availability endpoint. */
  availabilityType: string | undefined;
  /** A domain name or host is addressed by its A-label (core §16.3). */
  aLabelIdentifier: boolean;
  processes: Readonly<Partial<Record<ProcessKind, ProcessDefinition>>>;
}

const transfer = (objectType: string): ProcessDefinition => ({
  segment: "transferProcesses",
  objectType,
  operations: ["list", "create", "read", "delete", "transferApprove", "transferReject"],
});

// Derived from core Tables 3 and 7 and the operations of the proxy's OpenAPI; the proxy defines no `list` for
// organisations or users beyond the aggregate processes resource, and no read for renew (core issue 195).
export const RESOURCES = {
  domainName: {
    type: "domainName",
    collection: "domainNames",
    availabilityType: "domainNameAvailability",
    aLabelIdentifier: true,
    processes: {
      create: { segment: "createProcesses", objectType: "domainCreateProcess", operations: ["list", "read"] },
      renew: { segment: "renewProcesses", objectType: "renewProcess", operations: ["list", "create"] },
      restore: {
        segment: "restoreProcesses",
        objectType: "restoreProcess",
        operations: ["list", "create", "read", "update"],
      },
      transfer: transfer("domainTransferProcess"),
    },
  },
  contact: {
    type: "contact",
    collection: "contacts",
    availabilityType: "contactAvailability",
    aLabelIdentifier: false,
    processes: { transfer: transfer("transferProcess") },
  },
  host: {
    type: "host",
    collection: "hosts",
    availabilityType: "hostAvailability",
    aLabelIdentifier: true,
    processes: { transfer: transfer("transferProcess") },
  },
  organisation: {
    type: "organisation",
    collection: "organisations",
    availabilityType: undefined,
    aLabelIdentifier: false,
    processes: {},
  },
  user: {
    type: "user",
    collection: "users",
    availabilityType: undefined,
    aLabelIdentifier: false,
    processes: {},
  },
} as const satisfies Record<string, ResourceDefinition>;
