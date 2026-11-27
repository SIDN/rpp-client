import { STATUS_VOCABULARIES } from "../core/status/statuses";
import type { QueryOperator } from "./queryObject";

/** What a value of an element is, which decides the operators it offers. */
export type SearchValueType = "string" | "timestamp" | "integer" | "boolean";

/** `must`: every server that offers query on the object filters and sorts on it; `may`: a server can. */
export type SearchLevel = "must" | "may";

export interface SearchableElement {
  /** Dotted element path, as sent in a condition or sort key. */
  path: string;
  level: SearchLevel;
  type: SearchValueType;
  /** Known values, as suggestions; others are allowed. */
  suggestions?: readonly string[];
  /** Path prefixes whose value is a map: their members' values are searched, as for an array. */
  maps?: readonly string[];
}

export type SearchableObjectType = "domainName" | "contact" | "host" | "organisation";

/** Every element offers these (issue 210: MUST). */
const BASE_OPERATORS: readonly QueryOperator[] = ["eq", "ne", "in", "pr"];
const ORDERING_OPERATORS: readonly QueryOperator[] = ["lt", "le", "gt", "ge"];
const STRING_OPERATORS: readonly QueryOperator[] = ["sw", "co"];

/** The operators of an element: comparisons for Timestamp and Integer, prefix and substring for strings. */
export function operatorsOf(element: Pick<SearchableElement, "type">): readonly QueryOperator[] {
  switch (element.type) {
    case "timestamp":
    case "integer":
      return [...BASE_OPERATORS, ...ORDERING_OPERATORS];
    case "string":
      return [...BASE_OPERATORS, ...STRING_OPERATORS];
    case "boolean":
      return BASE_OPERATORS;
  }
}

const status = (type: keyof typeof STATUS_VOCABULARIES): SearchableElement => ({
  path: "status.label",
  level: "must",
  type: "string",
  suggestions: STATUS_VOCABULARIES[type].read,
});
const must = (path: string, type: SearchValueType = "string"): SearchableElement => ({ path, level: "must", type });
const may = (path: string, type: SearchValueType = "string", maps?: readonly string[]): SearchableElement => ({
  path,
  level: "may",
  type,
  ...(maps && { maps }),
});

/*
 * The Searchable table of issue 210. Where the issue names a member that holds an object ("registrant", "contacts by
 * role", "nameservers", "parent", "organisation"), the path goes to the identifier of the reference. The paths for
 * "dns data", "dns addresses" and "contactInfo name and email" are this client's reading of the data model.
 * Organisation `roles` and the whole `provMetadata.*` wildcard are left out until the draft names the paths; message
 * objects are out of scope (issue 210), and users live in a collection below their organisation.
 */
export const SEARCHABLE_ELEMENTS: Readonly<Record<SearchableObjectType, readonly SearchableElement[]>> = {
  domainName: [
    must("name"),
    status("domainStatus"),
    must("provMetadata.spClientId"),
    must("provMetadata.crDate", "timestamp"),
    must("expiryDate", "timestamp"),
    may("uName"),
    may("lgr"),
    may("registrant.id"),
    may("contacts.label"),
    may("contacts.object.id"),
    may("nameservers.hostName"),
    may("provMetadata.upDate", "timestamp"),
    may("provMetadata.trDate", "timestamp"),
    may("provMetadata.crClientId"),
    may("status.due", "timestamp"),
    may("dns.records.type"),
  ],
  contact: [
    must("id"),
    status("contactStatus"),
    must("provMetadata.spClientId"),
    must("provMetadata.crDate", "timestamp"),
    must("linked", "boolean"),
    may("contactInfo.name.full"),
    may("contactInfo.emails.address", "string", ["contactInfo.emails"]),
  ],
  host: [
    must("hostName"),
    status("hostStatus"),
    must("provMetadata.spClientId"),
    must("linked", "boolean"),
    may("dns.records.rdata.address"),
    may("provMetadata.crDate", "timestamp"),
  ],
  organisation: [
    must("id"),
    status("organisationStatus"),
    must("parent.id"),
    may("provMetadata.spClientId"),
    may("provMetadata.crClientId"),
    may("provMetadata.crDate", "timestamp"),
    may("provMetadata.upDate", "timestamp"),
  ],
};

/** Elements that are returned only when asked for with `includeElements` (issue 210: `linked`). */
export const INCLUDABLE_ELEMENTS: Readonly<Record<SearchableObjectType, readonly string[]>> = {
  domainName: [],
  contact: ["linked"],
  host: ["linked"],
  organisation: [],
};

export const SEARCHABLE_OBJECT_TYPES = Object.keys(SEARCHABLE_ELEMENTS) as SearchableObjectType[];

export const isSearchableObjectType = (value: unknown): value is SearchableObjectType =>
  typeof value === "string" && (SEARCHABLE_OBJECT_TYPES as readonly string[]).includes(value);

export const searchableElement = (type: SearchableObjectType, path: string): SearchableElement | undefined =>
  SEARCHABLE_ELEMENTS[type].find((element) => element.path === path);
