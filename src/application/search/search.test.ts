import { describe, expect, it } from "vitest";
import { validateQueryObject, type QueryExpression, type QueryObject } from "@/rpp/query/queryObject";
import { SEARCHABLE_OBJECT_TYPES } from "@/rpp/query/searchable";
import { matches, valuesAt } from "./evaluate";
import { buildQueryObject, dateOfTimestamp, DEFAULT_PAGE_SIZE, emptyDraft, timestampOfDate, withElement, withOperator, type ConditionDraft, type SearchDraft } from "./queryDraft";
import { DEFAULT_LIMIT, POOL_SIZE, synthesizeSearchResults } from "./synthesize";

const NOW = new Date("2026-01-15T12:00:00Z");

const condition = (element: string, op: ConditionDraft["op"], value = "", negate = false): ConditionDraft => ({
  id: `${element}-${op}`,
  element,
  op,
  value,
  negate,
});

const draft = (overrides: Partial<SearchDraft>): SearchDraft => ({ ...emptyDraft("domainName"), ...overrides });

describe("buildQueryObject", () => {
  it("sends one condition as the filter itself, asks for the default page size, and leaves out what is not set", () => {
    const { query, problems } = buildQueryObject(draft({ conditions: [condition("name", "sw", "exa")] }));
    expect(query).toEqual({ filter: { element: "name", op: "sw", value: "exa" }, limit: DEFAULT_PAGE_SIZE });
    expect(problems).toEqual([]);
  });

  it("combines conditions, negates, sorts, limits and includes elements", () => {
    const { query, problems } = buildQueryObject({
      ...emptyDraft("contact"),
      combinator: "or",
      conditions: [condition("linked", "eq", "false"), condition("status.label", "in", " ok, linked ,", true), condition("id", "pr")],
      sort: [{ id: "s", element: "provMetadata.crDate", direction: "desc" }],
      limit: " 10 ",
      includeElements: ["linked", "linked", "authInfo"],
    });
    expect(problems).toEqual([]);
    expect(query).toEqual({
      filter: {
        or: [
          { element: "linked", op: "eq", value: false },
          { not: { element: "status.label", op: "in", value: ["ok", "linked"] } },
          { element: "id", op: "pr" },
        ],
      },
      sort: [{ element: "provMetadata.crDate", direction: "desc" }],
      limit: 10,
      includeElements: ["linked"],
    });
    expect(validateQueryObject(query)).toEqual({ status: "valid" });
  });

  it.each([
    [condition("name", "eq", ""), "missing-value"],
    [condition("name", "in", " , "), "missing-value"],
    [condition("expiryDate", "gt", "tomorrow"), "invalid-timestamp"],
    [condition("expiryDate", "in", "2026-01-01T00:00:00Z, soon"), "invalid-timestamp"],
    [condition("name", "gt", "a"), "unsupported-operator"],
    [condition("authInfo", "pr"), "unknown-element"],
  ] as const)("reports %j as %s and leaves it out", (input, kind) => {
    const { query, problems } = buildQueryObject(draft({ conditions: [input] }));
    expect(problems).toEqual([{ kind, conditionId: input.id }]);
    expect(query).toEqual({ limit: DEFAULT_PAGE_SIZE });
  });

  it("sends a date picked in the calendar as the start of that day in UTC, and back", () => {
    expect(timestampOfDate("2026-06-01")).toBe("2026-06-01T00:00:00Z");
    expect(timestampOfDate("")).toBe("");
    expect(dateOfTimestamp("2026-06-01T00:00:00Z")).toBe("2026-06-01");
    expect(dateOfTimestamp("2026-06-01T10:00:00+02:00")).toBe("");
  });

  it("drops a value the calendar cannot show when the element or operator changes", () => {
    const list = condition("expiryDate", "in", "2026-01-01T00:00:00Z, 2026-02-01T00:00:00Z");
    expect(withOperator(list, "domainName", "gt").value).toBe("");
    expect(withOperator(condition("expiryDate", "lt", "2026-01-01T00:00:00Z"), "domainName", "gt").value).toBe("2026-01-01T00:00:00Z");
    expect(withElement(condition("name", "eq", "example.nl"), "domainName", "expiryDate").value).toBe("");
    expect(withElement(condition("name", "eq", "example.nl"), "contact", "linked").value).toBe("true");
  });

  it("reports a limit that is not a positive integer", () => {
    expect(buildQueryObject(draft({ limit: "0" })).problems).toEqual([{ kind: "invalid-limit" }]);
    expect(buildQueryObject(draft({ limit: "2.5" })).problems).toEqual([{ kind: "invalid-limit" }]);
  });

  it("keeps a valid timestamp as typed", () => {
    const { query } = buildQueryObject(draft({ conditions: [condition("expiryDate", "lt", "2026-03-01T00:00:00+01:00")] }));
    expect(query.filter).toEqual({ element: "expiryDate", op: "lt", value: "2026-03-01T00:00:00+01:00" });
  });
});

describe("matches", () => {
  const domain = {
    "@type": "domainName",
    name: "example.test",
    status: [{ label: "ok" }, { label: "clientHold" }],
    expiryDate: "2026-06-01T00:00:00Z",
    contacts: [{ label: "admin", object: { id: "C1" } }, { label: "tech", object: { id: "C2" } }],
  };
  const check = (expression: QueryExpression) => matches("domainName", domain, expression);

  it("matches a multi-valued element when any value matches", () => {
    expect(check({ element: "status.label", op: "eq", value: "clientHold" })).toBe(true);
    expect(check({ element: "contacts.object.id", op: "in", value: ["C9", "C2"] })).toBe(true);
  });

  it("matches ne only when no value equals the operand, also when there is no value", () => {
    expect(check({ element: "status.label", op: "ne", value: "ok" })).toBe(false);
    expect(check({ element: "status.label", op: "ne", value: "serverHold" })).toBe(true);
    expect(check({ element: "uName", op: "ne", value: "x" })).toBe(true);
  });

  it("tests presence, prefixes, substrings and time", () => {
    expect(check({ element: "uName", op: "pr" })).toBe(false);
    expect(check({ element: "name", op: "pr" })).toBe(true);
    expect(check({ element: "name", op: "sw", value: "exa" })).toBe(true);
    expect(check({ element: "name", op: "co", value: "ample." })).toBe(true);
    expect(check({ element: "expiryDate", op: "gt", value: "2026-05-31T23:00:00-02:00" })).toBe(false);
    expect(check({ element: "expiryDate", op: "le", value: "2026-06-01T02:00:00+02:00" })).toBe(true);
  });

  it("combines with and, or and not", () => {
    const yes = { element: "name", op: "pr" } as const;
    const no = { element: "uName", op: "pr" } as const;
    expect(check({ and: [yes, no] })).toBe(false);
    expect(check({ or: [no, yes] })).toBe(true);
    expect(check({ not: no })).toBe(true);
  });

  it("reads the values of a map", () => {
    const card = { contactInfo: { emails: { work: { address: "a@x.test" }, home: { address: "b@x.test" } } } };
    expect(valuesAt(card, "contactInfo.emails.address", ["contactInfo.emails"])).toEqual(["a@x.test", "b@x.test"]);
  });
});

describe("synthesizeSearchResults", () => {
  it.each(SEARCHABLE_OBJECT_TYPES)("returns %s objects only, all marked as synthesized", (type) => {
    const results = synthesizeSearchResults(type, {}, { now: NOW });
    expect(results.results).toHaveLength(DEFAULT_LIMIT);
    expect(results.total).toBe(POOL_SIZE);
    expect(results.nextCursor).toBeDefined();
    for (const object of results.results) {
      expect(object["@type"]).toBe(type);
      expect((object.provMetadata as { repositoryId: string }).repositoryId).toMatch(/^SYNTH-/);
    }
  });

  it("returns only objects that satisfy the filter, and finds some for a narrow one", () => {
    const query: QueryObject = {
      filter: {
        and: [
          { element: "name", op: "sw", value: "exa" },
          { element: "status.label", op: "in", value: ["clientHold", "serverHold"] },
          { element: "expiryDate", op: "gt", value: "2027-01-01T00:00:00Z" },
          { not: { element: "provMetadata.spClientId", op: "eq", value: "registrar-b" } },
        ],
      },
    };
    const { results, total } = synthesizeSearchResults("domainName", query, { now: NOW });
    expect(results.length).toBeGreaterThan(0);
    expect(total).toBe(results.length);
    for (const object of results) expect(matches("domainName", object, query.filter)).toBe(true);
  });

  it("spreads a timestamp with both a lower and an upper bound over the range", () => {
    const filter: QueryExpression = {
      and: [
        { element: "expiryDate", op: "ge", value: "2026-02-01T00:00:00Z" },
        { element: "expiryDate", op: "lt", value: "2026-03-03T00:00:00Z" },
      ],
    };
    const { results } = synthesizeSearchResults("domainName", { filter, limit: 60 }, { now: NOW });
    const days = results.map((object) => (Date.parse(object.expiryDate as string) - Date.parse("2026-02-01T00:00:00Z")) / 86400000);
    expect(results.length).toBeGreaterThanOrEqual(16);
    expect(Math.min(...days)).toBeLessThan(5);
    expect(Math.max(...days)).toBeGreaterThan(25);
  });

  it("sorts, pages and is the same every time", () => {
    const query: QueryObject = { sort: [{ element: "expiryDate", direction: "desc" }], limit: 5 };
    const first = synthesizeSearchResults("domainName", query, { now: NOW });
    expect(synthesizeSearchResults("domainName", query, { now: NOW })).toEqual(first);
    const dates = first.results.map((object) => Date.parse(object.expiryDate as string));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));

    const next = synthesizeSearchResults("domainName", { ...query, cursor: first.nextCursor }, { now: NOW });
    expect(Date.parse(next.results[0].expiryDate as string)).toBeLessThanOrEqual(dates[4]);
  });

  it("returns linked only when it is asked for, but filters on it either way", () => {
    const filter: QueryExpression = { element: "linked", op: "eq", value: false };
    const hidden = synthesizeSearchResults("host", { filter }, { now: NOW });
    expect(hidden.results.length).toBeGreaterThan(0);
    expect(hidden.results.every((object) => !("linked" in object))).toBe(true);
    const shown = synthesizeSearchResults("host", { filter, includeElements: ["linked"] }, { now: NOW });
    expect(shown.results.every((object) => object.linked === false)).toBe(true);
  });

  it("gives identifiers random numbers that follow the seed", () => {
    const ids = (type: "domainName" | "contact" | "host" | "organisation", seed: number) =>
      synthesizeSearchResults(type, {}, { now: NOW, tld: "nl", seed }).results.map((object) => String(object.name ?? object.id ?? object.hostName));
    expect(ids("domainName", 7).every((name) => /^name-\d+\.nl$/.test(name))).toBe(true);
    expect(ids("contact", 7).every((id) => /^contact-\d+$/.test(id))).toBe(true);
    expect(ids("host", 7).every((name) => /^ns[12]\.name-\d+\.nl$/.test(name))).toBe(true);
    expect(ids("organisation", 7).every((id) => /^org-\d+$/.test(id))).toBe(true);
    expect(new Set(ids("contact", 7)).size).toBe(DEFAULT_LIMIT);
    expect(ids("contact", 7)).toEqual(ids("contact", 7));
    expect(ids("contact", 8)).not.toEqual(ids("contact", 7));
  });

  it.each(SEARCHABLE_OBJECT_TYPES)("never names a registrar in a %s, not even when filtering on one", (type) => {
    const filter: QueryExpression = { element: "provMetadata.spClientId", op: "eq", value: "registrar-x" };
    const { results } = synthesizeSearchResults(type, { filter }, { now: NOW });
    expect(results.length).toBeGreaterThan(0);
    for (const object of results) {
      const metadata = object.provMetadata as Record<string, unknown>;
      expect(metadata).not.toHaveProperty("spClientId");
      expect(metadata).not.toHaveProperty("crClientId");
      expect(metadata).not.toHaveProperty("upClientId");
    }
  });

  it("finds contacts by e-mail address", () => {
    const filter: QueryExpression = { element: "contactInfo.emails.address", op: "sw", value: "jan" };
    const { results } = synthesizeSearchResults("contact", { filter }, { now: NOW });
    expect(results.length).toBeGreaterThan(0);
  });
});
