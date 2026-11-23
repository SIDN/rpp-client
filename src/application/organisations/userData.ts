import { STATUS_VOCABULARIES } from "@/rpp/core/status/statuses";
import { isJsonObject } from "@/rpp/core/types/json";
import type { User, UserCreate } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { invalidRequest } from "@/rpp/operations/paths";
import { cardDataOf, cardOf, cardPatch, EMPTY_CARD_DATA, type CardData } from "./card";

export const USER_CLIENT_STATUSES: readonly string[] = STATUS_VOCABULARIES.userStatus.clientSettable;

/** What the forms edit of a user. */
export interface UserData {
  card: CardData;
  description: string;
  /** A status the client may set, or empty to leave the status as it is. */
  status: string;
}

export const EMPTY_USER: UserData = { card: EMPTY_CARD_DATA, description: "", status: "" };

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function userEditOf(user: User): UserData {
  const label = text(isJsonObject(user.status) ? user.status.label : undefined);
  return {
    card: cardDataOf(user.details),
    description: text(user.description),
    status: USER_CLIENT_STATUSES.includes(label) ? label : "",
  };
}

/** Whitespace around the identifier is dropped; nothing else is changed. */
export function parseUserId(input: string): string {
  const id = input.trim();
  if (id === "") throw invalidRequest("Enter a user identifier");
  return id;
}

export interface CreateUserInput {
  /** Unique within the organisation, not beyond it. */
  id: string;
  data: UserData;
}

export function createBody(input: CreateUserInput): UserCreate {
  const description = input.data.description.trim();
  if (input.data.status !== "" && !USER_CLIENT_STATUSES.includes(input.data.status)) {
    throw invalidRequest(`A new user cannot be given the status ${input.data.status}`);
  }
  return {
    "@type": "user",
    id: parseUserId(input.id),
    details: cardOf(input.data.card),
    ...(description && { description }),
    ...(input.data.status && { status: { "@type": "userStatus" as const, label: input.data.status } }),
  };
}

/**
 * The JSON Patch (json §5.2) that turns `current` into `wanted`: one operation for each member that was added, changed
 * or removed. The status can only be set to one the client may set; leaving it empty keeps it.
 */
export function buildUserPatch(current: User, wanted: UserData): PatchOperation[] {
  const before = userEditOf(current);
  const operations: PatchOperation[] = [];

  operations.push(...cardPatch("/details", current.details, wanted.card));

  const description = wanted.description.trim();
  if (description !== before.description) {
    if (description === "") operations.push({ op: "remove", path: "/description" });
    else if (before.description === "") operations.push({ op: "add", path: "/description", value: description });
    else operations.push({ op: "replace", path: "/description", value: description });
  }

  if (wanted.status !== "" && wanted.status !== before.status) {
    operations.push({ op: "replace", path: "/status", value: { "@type": "userStatus", label: wanted.status } });
  }
  return operations;
}

/** One operation as a line a registrar can read before sending it. */
export function describeUserOperation(operation: PatchOperation): string {
  const member = operation.path.split("/")[2];
  const verb = operation.op === "remove" ? "Remove" : operation.op === "add" ? "Add" : "Change";
  if (operation.path === "/description") return `${verb} the description`;
  if (operation.path === "/status" && operation.op !== "remove") {
    return `Set the status to ${text(isJsonObject(operation.value) ? operation.value.label : undefined)}`;
  }
  if (operation.path.startsWith("/details")) {
    return `${verb} ${member === "name" ? "the name" : member === "emails" ? "the email address" : member === "phones" ? "the phone number" : "the details"}`;
  }
  return `${operation.op} ${operation.path}`;
}
