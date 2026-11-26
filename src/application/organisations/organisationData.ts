import { t } from "@/i18n";
import { STATUS_VOCABULARIES } from "@/rpp/core/status/statuses";
import { isJsonObject } from "@/rpp/core/types/json";
import type { Organisation, OrganisationCreate } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { invalidRequest } from "@/rpp/operations/paths";
import { cardDataOf, cardOf, cardPatch, EMPTY_CARD_DATA, hasCardData, type CardData } from "./card";

export const ORGANISATION_CLIENT_STATUSES: readonly string[] = STATUS_VOCABULARIES.organisationStatus.clientSettable;
export const ROLE_CLIENT_STATUS = "clientLinkProhibited";

// The initial values of the IANA registries the draft points to; a server may accept others.
export const ROLE_TYPES = ["registrar", "reseller", "privacyproxy", "dns-operator"] as const;
export const CONTACT_TYPES = ["admin", "tech", "billing", "abuse", "custom"] as const;

export interface RoleData {
  /** The type of the role, which is the key of the role in `roles`. */
  name: string;
  /** A third-party identifier, such as an IANA ID for a registrar. */
  roleId: string;
  /** The role has the status `clientLinkProhibited`. */
  linkProhibited: boolean;
}

export interface ContactLinkData {
  /** The type of the contact. */
  label: string;
  /** The identifier of the contact. */
  id: string;
}

/** What the forms edit of an organisation. Its users are created and changed one by one, below the organisation. */
export interface OrganisationData {
  roles: RoleData[];
  /** The identifier of the parent organisation; empty for none. */
  parent: string;
  card: CardData;
  contacts: ContactLinkData[];
  clientStatuses: string[];
}

export const EMPTY_ROLE: RoleData = { name: "", roleId: "", linkProhibited: false };

export const EMPTY_ORGANISATION: OrganisationData = {
  roles: [EMPTY_ROLE],
  parent: "",
  card: EMPTY_CARD_DATA,
  contacts: [],
  clientStatuses: [],
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const record = (value: unknown): Record<string, unknown> => (isJsonObject(value) ? value : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const labelsOf = (statuses: unknown): string[] => list(statuses).map((status) => text(record(status).label)).filter((label) => label !== "");

export function rolesOf(organisation: Organisation): RoleData[] {
  return Object.entries(record(organisation.roles)).map(([name, role]) => ({
    name,
    roleId: text(record(role).roleId),
    linkProhibited: labelsOf(record(role).status).includes(ROLE_CLIENT_STATUS),
  }));
}

export function roleStatusesOf(organisation: Organisation, name: string): string[] {
  return labelsOf(record(record(organisation.roles)[name]).status);
}

export function contactLinksOf(organisation: Organisation): ContactLinkData[] {
  return list(organisation.contacts).map((entry) => ({ label: text(record(entry).label), id: text(record(record(entry).object).id) }));
}

export interface UserLink {
  id: string;
  /** What the organisation calls the user's role; empty for a user it does not list. */
  label: string;
}

/** The users the organisation lists, then those seen in this session that it does not (yet) list. */
export function userLinksOf(organisation: Organisation | undefined, seen: readonly string[] = []): UserLink[] {
  const links = new Map<string, UserLink>();
  for (const entry of list(organisation?.users)) {
    const id = text(record(record(entry).object).id);
    if (id !== "" && !links.has(id)) links.set(id, { id, label: text(record(entry).label) });
  }
  for (const id of seen) if (id !== "" && !links.has(id)) links.set(id, { id, label: "" });
  return [...links.values()];
}

export function organisationEditOf(organisation: Organisation): OrganisationData {
  return {
    roles: rolesOf(organisation),
    parent: text(record(organisation.parent).id),
    card: cardDataOf(organisation.contactInfo),
    contacts: contactLinksOf(organisation),
    clientStatuses: labelsOf(organisation.status).filter((label) => ORGANISATION_CLIENT_STATUSES.includes(label)),
  };
}

/** Whitespace around the identifier is dropped; nothing else is changed. */
export function parseOrganisationId(input: string): string {
  const id = input.trim();
  if (id === "") throw invalidRequest(t("organisations.validation.organisationId"));
  return id;
}

const blankRole = (role: RoleData) => role.name.trim() === "" && role.roleId.trim() === "" && !role.linkProhibited;
const blankLink = (link: ContactLinkData) => link.label.trim() === "" && link.id.trim() === "";

/** Trims what was typed and drops the rows left empty; refuses what the draft does not allow. */
export function cleanOrganisation(data: OrganisationData): OrganisationData {
  const roles = data.roles.filter((role) => !blankRole(role)).map((role) => ({ ...role, name: role.name.trim(), roleId: role.roleId.trim() }));
  const contacts = data.contacts.filter((link) => !blankLink(link)).map((link) => ({ label: link.label.trim(), id: link.id.trim() }));

  if (roles.length === 0) throw invalidRequest(t("organisations.validation.roleRequired"));
  const names = new Set<string>();
  for (const role of roles) {
    if (role.name === "") throw invalidRequest(t("organisations.validation.roleTypeRequired"));
    if (names.has(role.name)) throw invalidRequest(t("organisations.validation.roleDuplicate", { name: role.name }));
    names.add(role.name);
  }
  const links = new Set<string>();
  for (const link of contacts) {
    if (link.id === "") throw invalidRequest(t("organisations.validation.contactIdRequired", { type: link.label }));
    if (link.label === "") throw invalidRequest(t("organisations.validation.contactTypeRequired", { id: link.id }));
    const key = `${link.label}\n${link.id}`;
    if (links.has(key)) throw invalidRequest(t("organisations.validation.contactDuplicate", { id: link.id, type: link.label }));
    links.add(key);
  }

  return {
    roles,
    parent: data.parent.trim(),
    card: data.card,
    contacts,
    clientStatuses: data.clientStatuses,
  };
}

const roleStatus = { "@type": "organisationRoleStatus", label: ROLE_CLIENT_STATUS };
const roleBody = (role: RoleData) => ({
  "@type": "organisationRole",
  ...(role.roleId && { roleId: role.roleId }),
  ...(role.linkProhibited && { status: [roleStatus] }),
});
const contactEntry = (link: ContactLinkData) => ({ label: link.label, object: { "@type": "contact" as const, id: link.id } });

export interface CreateOrganisationInput {
  id: string;
  data: OrganisationData;
}

export function createBody(input: CreateOrganisationInput): OrganisationCreate {
  const data = cleanOrganisation(input.data);
  return {
    "@type": "organisation",
    id: parseOrganisationId(input.id),
    ...(data.clientStatuses.length > 0 && { status: data.clientStatuses.map((label) => ({ "@type": "organisationStatus" as const, label })) }),
    roles: Object.fromEntries(data.roles.map((role) => [role.name, roleBody(role)])),
    ...(data.parent && { parent: { "@type": "organisation" as const, id: data.parent } }),
    ...(hasCardData(data.card) && { contactInfo: cardOf(data.card) }),
    ...(data.contacts.length > 0 && { contacts: data.contacts.map(contactEntry) }),
  };
}

const pointer = (member: string) => member.replaceAll("~", "~0").replaceAll("/", "~1");
const sameLink = (a: ContactLinkData, b: ContactLinkData) => a.label === b.label && a.id === b.id;

/**
 * The JSON Patch (json §5.2) that turns `current` into `wanted`: one operation for each role, contact, status or member
 * that was added, changed or removed, so what the form does not show stays as the registry has it. Whether a change is
 * allowed is the registry's to say. The users of the organisation are not part of it.
 */
export function buildOrganisationPatch(current: Organisation, edit: OrganisationData): PatchOperation[] {
  const wanted = cleanOrganisation(edit);
  const before = organisationEditOf(current);
  const operations: PatchOperation[] = [];

  for (const role of before.roles) {
    if (!wanted.roles.some((entry) => entry.name === role.name)) operations.push({ op: "remove", path: `/roles/${pointer(role.name)}` });
  }
  for (const role of wanted.roles) {
    const had = before.roles.find((entry) => entry.name === role.name);
    const path = `/roles/${pointer(role.name)}`;
    if (!had) {
      operations.push({ op: "add", path, value: roleBody(role) });
      continue;
    }
    if (role.roleId !== had.roleId) {
      if (role.roleId === "") operations.push({ op: "remove", path: `${path}/roleId` });
      else if (had.roleId === "") operations.push({ op: "add", path: `${path}/roleId`, value: role.roleId });
      else operations.push({ op: "replace", path: `${path}/roleId`, value: role.roleId });
    }
    if (role.linkProhibited !== had.linkProhibited) {
      const hasStatuses = Array.isArray(record(record(current.roles)[role.name]).status);
      if (!role.linkProhibited) operations.push({ op: "remove", path: `${path}/status`, match: { label: ROLE_CLIENT_STATUS } });
      else operations.push({ op: "add", path: `${path}/status`, value: hasStatuses ? roleStatus : [roleStatus] });
    }
  }

  if (wanted.parent !== before.parent) {
    if (wanted.parent === "") operations.push({ op: "remove", path: "/parent" });
    else if (before.parent === "") operations.push({ op: "add", path: "/parent", value: { "@type": "organisation", id: wanted.parent } });
    else operations.push({ op: "replace", path: "/parent/id", value: wanted.parent });
  }

  if (current.contactInfo === undefined) {
    if (hasCardData(wanted.card)) operations.push({ op: "add", path: "/contactInfo", value: cardOf(wanted.card) });
  } else {
    operations.push(...cardPatch("/contactInfo", current.contactInfo, wanted.card));
  }

  for (const link of before.contacts) {
    if (!wanted.contacts.some((entry) => sameLink(entry, link))) {
      operations.push({ op: "remove", path: "/contacts", match: { label: link.label, object: { id: link.id } } });
    }
  }
  const added = wanted.contacts.filter((link) => !before.contacts.some((entry) => sameLink(entry, link)));
  if (added.length > 0 && !Array.isArray(current.contacts)) {
    operations.push({ op: "add", path: "/contacts", value: added.map(contactEntry) });
  } else {
    for (const link of added) operations.push({ op: "add", path: "/contacts", value: contactEntry(link) });
  }

  for (const label of before.clientStatuses) {
    if (!wanted.clientStatuses.includes(label)) operations.push({ op: "remove", path: "/status", match: { label } });
  }
  for (const label of wanted.clientStatuses) {
    if (!before.clientStatuses.includes(label)) operations.push({ op: "add", path: "/status", value: { "@type": "organisationStatus", label } });
  }
  return operations;
}

const unpointer = (member: string) => member.replaceAll("~1", "/").replaceAll("~0", "~");

/** One operation as a line a registrar can read before sending it. */
export function describeOrganisationOperation(operation: PatchOperation): string {
  const [, member, name, leaf] = operation.path.split("/").map(unpointer);
  const value = record("value" in operation ? operation.value : undefined);
  const match = record("match" in operation ? operation.match : undefined);

  if (member === "roles") {
    if (leaf === undefined && name !== undefined) {
      if (operation.op === "remove") return t("organisations.operation.role.remove", { name });
      if (operation.op === "add") return t("organisations.operation.role.add", { name });
      return t("organisations.operation.role.change", { name });
    }
    if (leaf === "roleId") {
      if (operation.op === "remove") return t("organisations.operation.roleId.remove", { name: String(name) });
      if (operation.op === "add") return t("organisations.operation.roleId.add", { name: String(name) });
      return t("organisations.operation.roleId.change", { name: String(name) });
    }
    return operation.op === "remove" ? t("organisations.operation.allowRoleLink", { name: String(name) }) : t("organisations.operation.prohibitRoleLink", { name: String(name) });
  }
  if (member === "parent") {
    if (operation.op === "remove") return t("organisations.operation.removeParent");
    return t("organisations.operation.setParent", { id: text(operation.op === "add" ? value.id : operation.value) });
  }
  if (member === "contacts") {
    const link = operation.op === "remove" ? { label: text(match.label), id: text(record(match.object).id) } : { label: text(value.label), id: text(record(value.object).id) };
    return operation.op === "remove" ? t("organisations.operation.removeContact", { type: link.label, id: link.id }) : t("organisations.operation.addContact", { type: link.label, id: link.id });
  }
  if (member === "status") {
    const label = operation.op === "remove" ? text(match.label) : text(value.label);
    return operation.op === "remove" ? t("organisations.operation.removeStatus", { status: label }) : t("organisations.operation.addStatus", { status: label });
  }
  if (member === "contactInfo") {
    const subject = name === "name" ? t("organisations.operation.subject.name") : name === "emails" ? t("organisations.operation.subject.email") : name === "phones" ? t("organisations.operation.subject.phone") : t("organisations.operation.subject.contactInfo");
    if (operation.op === "remove") return t("organisations.operation.removeSubject", { subject });
    if (operation.op === "add") return t("organisations.operation.addSubject", { subject });
    return t("organisations.operation.changeSubject", { subject });
  }
  return `${operation.op} ${operation.path}`;
}
