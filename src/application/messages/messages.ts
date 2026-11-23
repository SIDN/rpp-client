import { isJsonObject } from "@/rpp/core/types/json";
import type { Message } from "@/rpp/core/types/objects";

export interface MessageTypeInfo {
  /** The `@type` of the data of a message. */
  id: string;
  label: string;
}

/** The message types of the data objects draft (§9.19). A server may send others; they are kept and shown as received. */
export const MESSAGE_TYPES: readonly MessageTypeInfo[] = [
  { id: "reviewResponseMessage", label: "Review response" },
  { id: "transferRequestMessage", label: "Transfer request" },
  { id: "transferOutcomeMessage", label: "Transfer outcome" },
  { id: "expirationDeletionMessage", label: "Expiration deletion" },
  { id: "autoRenewalMessage", label: "Auto-renewal" },
  { id: "serviceNoticeMessage", label: "Service notice" },
];

/** The value of the type filter that asks for every type. */
export const ALL_TYPES = "";

export const MESSAGE_LIMITS = [10, 25, 50, 100] as const;
export const DEFAULT_MESSAGE_LIMIT = 25;

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const record = (value: unknown): Record<string, unknown> => (isJsonObject(value) ? value : {});

export const messageTypeOf = (message: Message): string => text(record(message.data)["@type"]);

export const isKnownType = (type: string): boolean => MESSAGE_TYPES.some((entry) => entry.id === type);

export const typeLabel = (type: string): string => MESSAGE_TYPES.find((entry) => entry.id === type)?.label ?? (type === "" ? "No type" : type);

/** The types in the messages that the draft does not define, in the order they first appear. */
export function otherTypesIn(messages: readonly Message[]): string[] {
  const types = new Set<string>();
  for (const message of messages) {
    const type = messageTypeOf(message);
    if (type !== "" && !isKnownType(type)) types.add(type);
  }
  return [...types];
}

/** What a query returns, as a list: a list, or the lone message that the draft once promised; anything else is nothing. */
export function asMessages(data: unknown): Message[] {
  if (Array.isArray(data)) return data.filter((entry): entry is Message => isJsonObject(entry));
  return isJsonObject(data) && data["@type"] === "message" ? [data as Message] : [];
}

export interface MessageField {
  term: string;
  value: string;
  /** `time` is shown as a date and time, `code` in monospace. */
  kind: "text" | "time" | "code";
}

export interface MessageView {
  id: string;
  type: string;
  typeLabel: string;
  known: boolean;
  status: string;
  createdAt: string;
  objectType: string;
  objectId: string;
  /** One line for the table. */
  summary: string;
  /** The members of the data that its type defines, in the order of the draft; those it does not are in `others`. */
  fields: MessageField[];
  process: unknown;
  others: [string, unknown][];
}

const field = (term: string, value: unknown, kind: MessageField["kind"] = "text"): MessageField[] =>
  typeof value === "string" && value !== "" ? [{ term, value, kind }] : [];

interface TypeDescription {
  fields(data: Record<string, unknown>): MessageField[];
  summary(data: Record<string, unknown>): string;
  /** Members of the data the type defines, besides the base ones. */
  members: readonly string[];
}

const DESCRIPTIONS: Record<string, TypeDescription> = {
  reviewResponseMessage: {
    members: ["approved", "clientTransactionId", "serverTransactionId", "completionDate", "message", "process"],
    fields: (data) => [
      { term: "Result", value: data.approved === true ? "Approved" : data.approved === false ? "Denied" : "Not given", kind: "text" },
      ...field("Client transaction ID", data.clientTransactionId, "code"),
      ...field("Server transaction ID", data.serverTransactionId, "code"),
      ...field("Completed", data.completionDate, "time"),
      ...field("Message", data.message),
    ],
    summary: (data) => `${data.approved === true ? "Approved" : data.approved === false ? "Denied" : "Reviewed"}${text(data.message) ? `: ${text(data.message)}` : ""}`,
  },
  transferRequestMessage: {
    members: ["status", "requestDate", "actionDate", "process"],
    fields: (data) => [...field("Transfer status", data.status, "code"), ...field("Requested", data.requestDate, "time"), ...field("Respond before", data.actionDate, "time")],
    summary: (data) => `Transfer ${text(data.status) || "requested"}${text(data.actionDate) ? `, respond before ${text(data.actionDate)}` : ""}`,
  },
  transferOutcomeMessage: {
    members: ["trStatus", "requestDate", "actionDate", "expiryDate", "process"],
    fields: (data) => [
      ...field("Transfer status", data.trStatus, "code"),
      ...field("Requested", data.requestDate, "time"),
      ...field("Resolved", data.actionDate, "time"),
      ...field("New expiry", data.expiryDate, "time"),
    ],
    summary: (data) => `Transfer ${text(data.trStatus) || "resolved"}`,
  },
  expirationDeletionMessage: {
    members: ["deletionDate"],
    fields: (data) => field("Deleted", data.deletionDate, "time"),
    summary: (data) => `Deleted after expiration${text(data.deletionDate) ? ` on ${text(data.deletionDate)}` : ""}`,
  },
  autoRenewalMessage: {
    members: ["renewalDate", "expiryDate"],
    fields: (data) => [...field("Renewed", data.renewalDate, "time"), ...field("New expiry", data.expiryDate, "time")],
    summary: (data) => `Renewed automatically${text(data.expiryDate) ? `, now expires ${text(data.expiryDate)}` : ""}`,
  },
  serviceNoticeMessage: {
    members: ["message"],
    fields: (data) => field("Message", data.message),
    summary: (data) => text(data.message) || "Service notice",
  },
};

const BASE_MEMBERS = ["@type", "objectType", "objectId"];

/** A message as the screens show it. A type this client does not know is shown as received, with all of its data. */
export function viewOf(message: Message): MessageView {
  const data = record(message.data);
  const type = text(data["@type"]);
  const description = DESCRIPTIONS[type];
  const modelled = new Set([...BASE_MEMBERS, ...(description?.members ?? [])]);
  return {
    id: text(message.id),
    type,
    typeLabel: typeLabel(type),
    known: description !== undefined,
    status: text(message.status),
    createdAt: text(message.creationDate),
    objectType: text(data.objectType),
    objectId: text(data.objectId),
    summary: description ? description.summary(data) : "Message type not known to this client",
    fields: description ? description.fields(data) : [],
    process: data.process,
    others: Object.entries(data).filter(([key]) => !modelled.has(key)),
  };
}
