import {
  MAX_GROUP_SIZE,
  MAX_IN_VALUES,
  MAX_SORT_KEYS,
  type QueryCondition,
  type QueryExpression,
  type QueryObject,
  type QueryOperator,
  type QueryScalar,
} from "@/rpp/query/queryObject";
import {
  INCLUDABLE_ELEMENTS,
  operatorsOf,
  searchableElement,
  SEARCHABLE_ELEMENTS,
  type SearchableElement,
  type SearchableObjectType,
} from "@/rpp/query/searchable";

export { MAX_GROUP_SIZE as MAX_CONDITIONS, MAX_SORT_KEYS };

/** The page sizes offered; the query always asks for one of them. */
export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

export interface ConditionDraft {
  id: string;
  element: string;
  op: QueryOperator;
  /** As typed; `in` takes a comma-separated list. */
  value: string;
  negate: boolean;
}

export interface SortDraft {
  id: string;
  element: string;
  direction: "asc" | "desc";
}

/** What the search form holds: the query of one object type, before it is turned into a Query Object. */
export interface SearchDraft {
  objectType: SearchableObjectType;
  /** How two or more conditions are combined. */
  combinator: "and" | "or";
  conditions: ConditionDraft[];
  sort: SortDraft[];
  /** As typed; empty leaves the page size to the server. */
  limit: string;
  includeElements: string[];
}

export type DraftProblemKind =
  | "unknown-element"
  | "unsupported-operator"
  | "missing-value"
  | "invalid-boolean"
  | "invalid-integer"
  | "invalid-timestamp"
  | "too-many-values"
  | "invalid-limit";

export interface DraftProblem {
  kind: DraftProblemKind;
  /** The condition the problem is in; absent for the limit. */
  conditionId?: string;
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export function emptyDraft(objectType: SearchableObjectType): SearchDraft {
  return { objectType, combinator: "and", conditions: [], sort: [], limit: String(DEFAULT_PAGE_SIZE), includeElements: [] };
}

/** A new condition on the first element of the type that is not used yet. */
export function newCondition(draft: SearchDraft): ConditionDraft {
  const elements = SEARCHABLE_ELEMENTS[draft.objectType];
  const used = new Set(draft.conditions.map((condition) => condition.element));
  const element = elements.find((candidate) => !used.has(candidate.path)) ?? elements[0];
  return { id: nextId("condition"), element: element.path, op: "eq", value: "", negate: false };
}

export function newSortKey(draft: SearchDraft): SortDraft {
  const used = new Set(draft.sort.map((key) => key.element));
  const elements = SEARCHABLE_ELEMENTS[draft.objectType];
  const element = elements.find((candidate) => !used.has(candidate.path)) ?? elements[0];
  return { id: nextId("sort"), element: element.path, direction: "asc" };
}

/** The condition with another element: the operator stays if the element offers it. */
/** A date picked in a calendar (`YYYY-MM-DD`) as the timestamp sent: the start of that day in UTC. */
export const timestampOfDate = (date: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : "");

/** The calendar date of a timestamp made by `timestampOfDate`; empty for any other value. */
export const dateOfTimestamp = (value: string): string => /^(\d{4}-\d{2}-\d{2})T00:00:00Z$/.exec(value)?.[1] ?? "";

/** Whether the value of a condition is picked in a calendar: a single timestamp. */
export const usesCalendar = (element: SearchableElement | undefined, op: QueryOperator): boolean =>
  element?.type === "timestamp" && op !== "in" && op !== "pr";

/** The value kept when the element or operator changes: a default for a boolean, and nothing a calendar cannot show. */
function valueFor(element: SearchableElement | undefined, op: QueryOperator, value: string): string {
  if (element?.type === "boolean" && op !== "in") return value === "true" || value === "false" ? value : "true";
  if (usesCalendar(element, op)) return dateOfTimestamp(value) === "" ? "" : value;
  return value;
}

export function withElement(condition: ConditionDraft, objectType: SearchableObjectType, path: string): ConditionDraft {
  const element = searchableElement(objectType, path);
  const op = element && operatorsOf(element).includes(condition.op) ? condition.op : "eq";
  return { ...condition, element: path, op, value: valueFor(element, op, condition.value) };
}

export function withOperator(condition: ConditionDraft, objectType: SearchableObjectType, op: QueryOperator): ConditionDraft {
  return { ...condition, op, value: valueFor(searchableElement(objectType, condition.element), op, condition.value) };
}

// RFC 3339 date-time, as the data objects use for Timestamp.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;
const INTEGER = /^-?\d+$/;

type Parsed = { ok: true; value: QueryScalar } | { ok: false; problem: DraftProblemKind };

function scalarOf(element: SearchableElement, text: string): Parsed {
  switch (element.type) {
    case "boolean":
      return text === "true" || text === "false" ? { ok: true, value: text === "true" } : { ok: false, problem: "invalid-boolean" };
    case "integer":
      return INTEGER.test(text) ? { ok: true, value: Number(text) } : { ok: false, problem: "invalid-integer" };
    case "timestamp":
      return TIMESTAMP.test(text) && !Number.isNaN(Date.parse(text))
        ? { ok: true, value: text }
        : { ok: false, problem: "invalid-timestamp" };
    case "string":
      return { ok: true, value: text };
  }
}

function conditionOf(objectType: SearchableObjectType, draft: ConditionDraft): QueryCondition | DraftProblemKind {
  // Problem kinds are strings; a built condition is an object.
  const element = searchableElement(objectType, draft.element);
  if (!element) return "unknown-element";
  if (!operatorsOf(element).includes(draft.op)) return "unsupported-operator";
  if (draft.op === "pr") return { element: element.path, op: "pr" };

  if (draft.op === "in") {
    const parts = draft.value.split(",").map((part) => part.trim()).filter((part) => part !== "");
    if (parts.length === 0) return "missing-value";
    if (parts.length > MAX_IN_VALUES) return "too-many-values";
    const values: QueryScalar[] = [];
    for (const part of parts) {
      const parsed = scalarOf(element, part);
      if (!parsed.ok) return parsed.problem;
      values.push(parsed.value);
    }
    return { element: element.path, op: "in", value: values };
  }

  const text = element.type === "string" ? draft.value : draft.value.trim();
  if (text === "") return "missing-value";
  const parsed = scalarOf(element, text);
  return parsed.ok ? { element: element.path, op: draft.op, value: parsed.value } : parsed.problem;
}

/**
 * The Query Object of the draft and what keeps it from being complete. A condition with a problem is left out, so the
 * object shown is always the one that would be sent. One condition is the filter itself; more are an `and` or `or`.
 */
export function buildQueryObject(draft: SearchDraft): { query: QueryObject; problems: DraftProblem[] } {
  const problems: DraftProblem[] = [];
  const expressions: QueryExpression[] = [];
  for (const condition of draft.conditions.slice(0, MAX_GROUP_SIZE)) {
    const built = conditionOf(draft.objectType, condition);
    if (typeof built === "string") problems.push({ kind: built, conditionId: condition.id });
    else expressions.push(condition.negate ? { not: built } : built);
  }

  const query: QueryObject = {};
  if (expressions.length === 1) query.filter = expressions[0];
  else if (expressions.length > 1) query.filter = draft.combinator === "and" ? { and: expressions } : { or: expressions };

  const sort = draft.sort
    .slice(0, MAX_SORT_KEYS)
    .filter((key) => searchableElement(draft.objectType, key.element) !== undefined)
    .map((key) => ({ element: key.element, direction: key.direction }));
  if (sort.length > 0) query.sort = sort;

  const limit = draft.limit.trim();
  if (limit !== "") {
    if (INTEGER.test(limit) && Number(limit) >= 1) query.limit = Number(limit);
    else problems.push({ kind: "invalid-limit" });
  }

  const includable = INCLUDABLE_ELEMENTS[draft.objectType];
  const includeElements = [...new Set(draft.includeElements)].filter((path) => includable.includes(path));
  if (includeElements.length > 0) query.includeElements = includeElements;

  return { query, problems };
}
