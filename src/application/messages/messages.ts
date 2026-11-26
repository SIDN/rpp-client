import { t } from "@/i18n";
import { isJsonObject } from "@/rpp/core/types/json";
import type { Message } from "@/rpp/core/types/objects";

export interface MessageTypeInfo {
  /** The `@type` of the data of a message. */
  id: string;
  labelKey: string;
  readonly label: string;
}

function messageType(id: string, labelKey: string): MessageTypeInfo {
  return { id, labelKey, get label() { return typeLabel(id); } };
}

/** The message types of the data objects draft (§9.19). A server may send others; they are kept and shown as received. */
export const MESSAGE_TYPES: readonly MessageTypeInfo[] = [
  messageType("reviewResponseMessage", "messages.type.reviewResponseMessage"),
  messageType("transferRequestMessage", "messages.type.transferRequestMessage"),
  messageType("transferOutcomeMessage", "messages.type.transferOutcomeMessage"),
  messageType("expirationDeletionMessage", "messages.type.expirationDeletionMessage"),
  messageType("autoRenewalMessage", "messages.type.autoRenewalMessage"),
  messageType("serviceNoticeMessage", "messages.type.serviceNoticeMessage"),
];

/** The value of the type filter that asks for every type. */
export const ALL_TYPES = "";

export const MESSAGE_LIMITS = [10, 25, 50, 100] as const;
export const DEFAULT_MESSAGE_LIMIT = 25;

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const record = (value: unknown): Record<string, unknown> => (isJsonObject(value) ? value : {});

export const messageTypeOf = (message: Message): string => text(record(message.data)["@type"]);

export const isKnownType = (type: string): boolean => MESSAGE_TYPES.some((entry) => entry.id === type);

export function typeLabel(type: string): string {
  switch (type) {
    case "reviewResponseMessage": return t("messages.type.reviewResponseMessage");
    case "transferRequestMessage": return t("messages.type.transferRequestMessage");
    case "transferOutcomeMessage": return t("messages.type.transferOutcomeMessage");
    case "expirationDeletionMessage": return t("messages.type.expirationDeletionMessage");
    case "autoRenewalMessage": return t("messages.type.autoRenewalMessage");
    case "serviceNoticeMessage": return t("messages.type.serviceNoticeMessage");
    default: return type === "" ? t("messages.type.none") : type;
  }
}

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
      { term: t("messages.field.result"), value: data.approved === true ? t("messages.result.approved") : data.approved === false ? t("messages.result.denied") : t("messages.result.notGiven"), kind: "text" },
      ...field(t("messages.field.clientTransactionId"), data.clientTransactionId, "code"),
      ...field(t("messages.field.serverTransactionId"), data.serverTransactionId, "code"),
      ...field(t("messages.field.completed"), data.completionDate, "time"),
      ...field(t("messages.field.message"), data.message),
    ],
    summary: (data) => {
      const result = data.approved === true ? t("messages.result.approved") : data.approved === false ? t("messages.result.denied") : t("messages.result.reviewed");
      return text(data.message) ? t("messages.summary.review.withMessage", { result, message: text(data.message) }) : result;
    },
  },
  transferRequestMessage: {
    members: ["status", "requestDate", "actionDate", "process"],
    fields: (data) => [...field(t("messages.field.transferStatus"), data.status, "code"), ...field(t("messages.field.requested"), data.requestDate, "time"), ...field(t("messages.field.respondBefore"), data.actionDate, "time")],
    summary: (data) => {
      const status = text(data.status);
      const date = text(data.actionDate);
      if (status && date) return t("messages.summary.transferStatusDate", { status, date });
      if (status) return t("messages.summary.transferStatus", { status });
      if (date) return t("messages.summary.transferRequestedDate", { date });
      return t("messages.summary.transferRequested");
    },
  },
  transferOutcomeMessage: {
    members: ["trStatus", "requestDate", "actionDate", "expiryDate", "process"],
    fields: (data) => [
      ...field(t("messages.field.transferStatus"), data.trStatus, "code"),
      ...field(t("messages.field.requested"), data.requestDate, "time"),
      ...field(t("messages.field.resolved"), data.actionDate, "time"),
      ...field(t("messages.field.newExpiry"), data.expiryDate, "time"),
    ],
    summary: (data) => text(data.trStatus) ? t("messages.summary.transferStatus", { status: text(data.trStatus) }) : t("messages.summary.transferResolved"),
  },
  expirationDeletionMessage: {
    members: ["deletionDate"],
    fields: (data) => field(t("messages.field.deleted"), data.deletionDate, "time"),
    summary: (data) => text(data.deletionDate) ? t("messages.summary.deletedOn", { date: text(data.deletionDate) }) : t("messages.summary.deletedAfterExpiration"),
  },
  autoRenewalMessage: {
    members: ["renewalDate", "expiryDate"],
    fields: (data) => [...field(t("messages.field.renewed"), data.renewalDate, "time"), ...field(t("messages.field.newExpiry"), data.expiryDate, "time")],
    summary: (data) => text(data.expiryDate) ? t("messages.summary.renewedWithExpiry", { date: text(data.expiryDate) }) : t("messages.summary.renewedAutomatically"),
  },
  serviceNoticeMessage: {
    members: ["message"],
    fields: (data) => field(t("messages.field.message"), data.message),
    summary: (data) => text(data.message) || t("messages.type.serviceNoticeMessage"),
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
    summary: description ? description.summary(data) : t("messages.summary.unknownType"),
    fields: description ? description.fields(data) : [],
    process: data.process,
    others: Object.entries(data).filter(([key]) => !modelled.has(key)),
  };
}
