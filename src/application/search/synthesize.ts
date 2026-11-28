import { STATUS_VOCABULARIES } from "@/rpp/core/status/statuses";
import type { RppObject } from "@/rpp/core/types/objects";
import { isCondition, type QueryCondition, type QueryExpression, type QueryObject, type QueryResults, type QueryScalar } from "@/rpp/query/queryObject";
import { INCLUDABLE_ELEMENTS, searchableElement, type SearchableElement, type SearchableObjectType } from "@/rpp/query/searchable";
import { SYNTHETIC_PREFIX } from "../messages/synthesize";
import { matches, sortKeyCompare } from "./evaluate";

export { SYNTHETIC_PREFIX };

/** How many objects of a type exist to search through. */
export const POOL_SIZE = 60;
/** How many of them are shaped by the conditions of the query, so that a narrow query still finds something. */
const SHAPED = 16;
/** The page size when the query does not set one. */
export const DEFAULT_LIMIT = 25;

const CURSOR_PREFIX = `${SYNTHETIC_PREFIX}cursor-`;
const DAY = 86_400_000;

const PEOPLE = [
  ["Anna", "de Vries"], ["Bram", "Jansen"], ["Clara", "Bakker"], ["Daan", "Visser"], ["Eva", "Smit"], ["Finn", "Meijer"],
  ["Greta", "Mulder"], ["Hugo", "de Boer"], ["Iris", "Bos"], ["Joris", "Vos"], ["Kim", "Peters"],
] as const;
/** Members that name a registrar; a synthesized result never carries them. */
const REGISTRAR_MEMBERS = ["spClientId", "crClientId", "upClientId"] as const;
/** Identifier numbers are drawn from 1 to this, without repeats. */
const NUMBER_RANGE = 9999;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const pad = (value: number) => String(value).padStart(4, "0");

interface Context {
  at: (days: number) => string;
  tld: string;
  /** The random number of the `index`-th object of the pool, distinct within the pool. */
  number: (index: number) => number;
}

/** A small seeded generator (mulberry32), so the same seed gives the same results. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function distinctNumbers(seed: number, count: number): number[] {
  const random = generator(seed);
  const numbers = new Set<number>();
  while (numbers.size < count) numbers.add(1 + Math.floor(random() * NUMBER_RANGE));
  return [...numbers];
}

const domainLabel = (index: number, { number }: Context) => `name-${number(index)}`;
const contactId = (index: number, { number }: Context) => `contact-${number(index)}`;
const organisationId = (index: number, { number }: Context) => `org-${number(index)}`;

function provMetadata(index: number, prefix: string, { at }: Context): Json {
  return {
    "@type": "provMetadata",
    repositoryId: `${SYNTHETIC_PREFIX}${prefix}${pad(index)}`,
    crDate: at(-(30 + ((index * 97) % 1400))),
    upDate: at(-(1 + ((index * 13) % 29))),
    ...(index % 4 === 0 && { trDate: at(-(2 + ((index * 7) % 27))) }),
  };
}

function status(type: keyof typeof STATUS_VOCABULARIES, index: number): Json[] {
  const labels: readonly string[] = STATUS_VOCABULARIES[type].read;
  // Mostly "ok", with every other label of the type now and then.
  const value = index % 3 === 0 ? (labels.includes("ok") ? "ok" : labels[0]) : labels[(index * 5) % labels.length];
  return [{ "@type": type, label: value }];
}

const contactRef = (index: number, context: Context) => ({ "@type": "contact", id: contactId(index, context) });

const BUILDERS: Record<SearchableObjectType, (index: number, context: Context) => Json> = {
  domainName(index, context) {
    const name = `${domainLabel(index, context)}.${context.tld}`;
    return {
      "@type": "domainName",
      name,
      provMetadata: provMetadata(index, "D", context),
      status: status("domainStatus", index),
      registrant: contactRef(index % 17, context),
      contacts: [
        { label: "admin", object: contactRef(index % 17, context) },
        { label: "tech", object: contactRef((index + 5) % 17, context) },
      ],
      nameservers: [
        { "@type": "host", hostName: `ns1.${name}` },
        { "@type": "host", hostName: `ns2.${name}` },
      ],
      dns: {
        "@type": "dnsData",
        records:
          index % 3 === 0
            ? [{ "@type": "dnsRecord", name: "@", type: "ds", rdata: { keyTag: String(10000 + index), algorithm: "13", digestType: "2", digest: (index * 2654435761).toString(16).toUpperCase().padStart(16, "0") } }]
            : [{ "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: `ns1.${name}.` } }],
      },
      expiryDate: context.at(-60 + ((index * 53) % 700)),
    };
  },
  contact(index, context) {
    const [given, family] = PEOPLE[index % PEOPLE.length];
    const mailbox = `${given}.${family}`.toLowerCase().replace(/\s+/g, "");
    return {
      "@type": "contact",
      id: contactId(index, context),
      provMetadata: provMetadata(index, "C", context),
      status: status("contactStatus", index),
      contactInfo: {
        "@type": "Card",
        version: "1.0",
        kind: "individual",
        name: { "@type": "Name", full: `${given} ${family}` },
        emails: { email: { "@type": "EmailAddress", address: `${mailbox}${index}@example.${context.tld}` } },
      },
      linked: index % 3 !== 0,
    };
  },
  host(index, context) {
    const hostName = `ns${1 + (index % 2)}.${domainLabel(Math.floor(index / 2), context)}.${context.tld}`;
    return {
      "@type": "host",
      hostName,
      provMetadata: provMetadata(index, "H", context),
      status: status("hostStatus", index),
      dns: {
        "@type": "dnsData",
        records: [
          { "@type": "dnsRecord", name: `${hostName}.`, type: "a", rdata: { address: `192.0.2.${1 + (index % 254)}` } },
          { "@type": "dnsRecord", name: `${hostName}.`, type: "aaaa", rdata: { address: `2001:db8::${(index + 1).toString(16)}` } },
        ],
      },
      linked: index % 4 !== 0,
    };
  },
  organisation(index, context) {
    return {
      "@type": "organisation",
      id: organisationId(index, context),
      provMetadata: provMetadata(index, "O", context),
      status: status("organisationStatus", index),
      roles: {},
      ...(index % 3 !== 0 && { parent: { "@type": "organisation", id: organisationId(index % 5, context) } }),
    };
  },
};

/** Sets the value at a path; through an array the first member is taken, through a map its first value. */
function setAt(object: Json, element: SearchableElement, value: unknown): void {
  const segments = element.path.split(".");
  let current: Json = object;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    let next = current[segment];
    if (Array.isArray(next)) {
      if (next.length === 0) next.push({});
      next = next[0];
    }
    if (!isRecord(next)) {
      next = {};
      current[segment] = next;
    }
    if (element.maps?.includes(segments.slice(0, index + 1).join("."))) {
      const first: unknown = Object.values(next as Json)[0];
      if (!isRecord(first)) return;
      next = first;
    }
    current = next as Json;
  }
  current[segments[segments.length - 1]] = value;
}

const NAME_LIKE = new Set(["name", "uName", "hostName", "nameservers.hostName"]);

function extend(element: SearchableElement, value: string, shape: number, tld: string): string {
  if (NAME_LIKE.has(element.path) && !value.includes(".")) return `${value}${shape}.${tld}`;
  if (element.path.endsWith("emails.address") && !value.includes("@")) return `${value}${shape}@example.${tld}`;
  return `${value}${shape}`;
}

/** A value that satisfies the condition, for the `shape`-th shaped object; `undefined` when any value will do. */
function satisfying(condition: QueryCondition, element: SearchableElement, shape: number, context: Context): unknown {
  const step = shape + 1;
  switch (condition.op) {
    case "eq":
      return condition.value;
    case "in":
      return condition.value[shape % condition.value.length];
    case "sw":
      return typeof condition.value === "string" ? extend(element, condition.value, shape, context.tld) : undefined;
    case "co":
      if (typeof condition.value !== "string") return undefined;
      return NAME_LIKE.has(element.path) && !condition.value.includes(".")
        ? `x${shape}${condition.value}.${context.tld}`
        : `x${shape}${condition.value}`;
    case "lt":
    case "le":
    case "gt":
    case "ge": {
      const direction = condition.op === "lt" || condition.op === "le" ? -1 : 1;
      if (typeof condition.value === "number") return condition.value + direction * step;
      if (typeof condition.value !== "string") return undefined;
      const base = Date.parse(condition.value);
      return Number.isNaN(base) ? undefined : new Date(base + direction * step * DAY).toISOString().replace(/\.\d{3}Z$/, "Z");
    }
    case "pr":
      return element.type === "boolean" ? true : element.type === "timestamp" ? context.at(shape) : `${SYNTHETIC_PREFIX.toLowerCase()}${shape}`;
    case "ne":
      return undefined;
  }
}

/** The conditions to satisfy in the `shape`-th shaped object: all of an `and`, one of an `or` in turn, none under `not`. */
function conditionsFor(expression: QueryExpression | undefined, shape: number): QueryCondition[] {
  if (expression === undefined) return [];
  if (isCondition(expression)) return [expression];
  if ("and" in expression) return expression.and.flatMap((part) => conditionsFor(part, shape));
  if ("or" in expression) return conditionsFor(expression.or[shape % expression.or.length], shape);
  return [];
}

const timestampOf = (value: QueryScalar): number | undefined => (typeof value === "string" ? Date.parse(value) : Number.NaN) || undefined;

/**
 * Timestamps for elements that have both a lower and an upper bound, such as `expiryDate` between two dates: spread
 * over the range across the shaped objects, where one bound at a time would put them all near the other bound.
 */
function rangeValues(objectType: SearchableObjectType, conditions: QueryCondition[], shape: number): Map<string, string> {
  const values = new Map<string, string>();
  for (const lower of conditions) {
    if ((lower.op !== "gt" && lower.op !== "ge") || searchableElement(objectType, lower.element)?.type !== "timestamp") continue;
    const upper = conditions.find((condition) => condition.element === lower.element && (condition.op === "lt" || condition.op === "le"));
    if (!upper || !("value" in upper) || Array.isArray(upper.value)) continue;
    const from = timestampOf(lower.value);
    const to = timestampOf(upper.value);
    if (from === undefined || to === undefined || to - from < 2000) continue;
    const fraction = (((shape * 7) % SHAPED) + 0.5) / SHAPED;
    const at = Math.floor((from + (to - from) * fraction) / 1000) * 1000;
    values.set(lower.element, new Date(Math.min(Math.max(at, from + 1000), to - 1000)).toISOString().replace(/\.\d{3}Z$/, "Z"));
  }
  return values;
}

export interface SynthesizeOptions {
  now?: Date;
  /** The top-level domain of synthesized names; default `test`. */
  tld?: string;
  /** Seed of the random identifier numbers; the same seed gives the same identifiers. Default 1. */
  seed?: number;
}

/**
 * Results of a query that look like what a server could return: objects of the searched type, shaped by the conditions
 * of the filter, then filtered, sorted and paged as the query asks. Identifiers carry random numbers (`name-4821.nl`,
 * `contact-17`), and no result names a registrar. None of it comes from a server, and every object has a repository
 * identifier starting with `SYNTH-`.
 */
export function synthesizeSearchResults(
  objectType: SearchableObjectType,
  query: QueryObject,
  options: SynthesizeOptions = {},
): QueryResults<RppObject> {
  const now = (options.now ?? new Date()).getTime();
  const context: Context = {
    at: (days) => new Date(now + days * DAY).toISOString().replace(/\.\d{3}Z$/, "Z"),
    tld: options.tld?.replace(/^\./, "") || "test",
    number: (() => {
      const numbers = distinctNumbers(options.seed ?? 1, POOL_SIZE);
      return (index: number) => numbers[index];
    })(),
  };

  const pool = Array.from({ length: POOL_SIZE }, (_, index) => {
    const object = BUILDERS[objectType](index, context);
    if (index < SHAPED) {
      const conditions = conditionsFor(query.filter, index);
      const ranged = rangeValues(objectType, conditions, index);
      for (const condition of conditions) {
        const element = searchableElement(objectType, condition.element);
        const value = ranged.has(condition.element) ? ranged.get(condition.element) : element && satisfying(condition, element, index, context);
        if (element && value !== undefined) setAt(object, element, value);
      }
    }
    return object;
  });

  const matched = pool.filter((object) => matches(objectType, object, query.filter));
  if (query.sort && query.sort.length > 0) matched.sort(sortKeyCompare(objectType, query.sort));

  const offset = query.cursor?.startsWith(CURSOR_PREFIX) ? Number(query.cursor.slice(CURSOR_PREFIX.length)) || 0 : 0;
  const limit = query.limit ?? DEFAULT_LIMIT;
  const page = matched.slice(offset, offset + limit);

  // Elements such as `linked` are returned only when asked for.
  const included = new Set(query.includeElements ?? []);
  const hidden = INCLUDABLE_ELEMENTS[objectType].filter((path) => !included.has(path));
  const results = page.map((object) => {
    const copy = { ...object };
    for (const path of hidden) delete copy[path];
    if (isRecord(copy.provMetadata)) {
      const metadata = { ...copy.provMetadata };
      for (const member of REGISTRAR_MEMBERS) delete metadata[member];
      copy.provMetadata = metadata;
    }
    return copy as RppObject;
  });

  return {
    results,
    total: matched.length,
    ...(offset + limit < matched.length && { nextCursor: `${CURSOR_PREFIX}${offset + limit}` }),
  };
}
