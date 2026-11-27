import Ajv2020 from "ajv/dist/2020.js";
import { isJsonObject } from "../core/types/json";
import { toIssues, type ValidationResult } from "../schemas/validation";

/*
 * The Query Object of the optional `query` operation (draft-ietf-rpp-data-objects issue 210): a filter, sort keys,
 * a page size, an opaque cursor and `includeElements`. It is the content of `QUERY /{collection}` (RFC 10008).
 */

export const QUERY_OPERATORS = ["eq", "ne", "in", "pr", "lt", "le", "gt", "ge", "sw", "co"] as const;
export type QueryOperator = (typeof QUERY_OPERATORS)[number];

export type QueryScalar = string | number | boolean;

export type QueryCondition =
  | { element: string; op: "pr" }
  | { element: string; op: "in"; value: QueryScalar[] }
  | { element: string; op: Exclude<QueryOperator, "pr" | "in">; value: QueryScalar };

export type QueryExpression = QueryCondition | { and: QueryExpression[] } | { or: QueryExpression[] } | { not: QueryExpression };

export interface QuerySortKey {
  element: string;
  direction?: "asc" | "desc";
}

export interface QueryObject {
  filter?: QueryExpression;
  sort?: QuerySortKey[];
  limit?: number;
  cursor?: string;
  includeElements?: string[];
}

/** The result envelope: the matching objects and, when there are more, the cursor of the next page. */
export interface QueryResults<T> {
  results: T[];
  nextCursor?: string;
  total?: number;
}

export const MAX_SORT_KEYS = 5;
export const MAX_GROUP_SIZE = 20;
export const MAX_IN_VALUES = 100;

/** The generic JSON Schema of the Query Object, as proposed in the issue. */
export const QUERY_OBJECT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://example.org/rpp/query.schema.json",
  title: "RPP Query Object",
  type: "object",
  additionalProperties: false,
  properties: {
    filter: { $ref: "#/$defs/expression" },
    sort: { type: "array", maxItems: MAX_SORT_KEYS, items: { $ref: "#/$defs/sortKey" } },
    limit: { type: "integer", minimum: 1 },
    cursor: { type: "string", minLength: 1, maxLength: 2048 },
    includeElements: { type: "array", uniqueItems: true, items: { $ref: "#/$defs/path" } },
  },
  $defs: {
    path: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9]*(\\.[A-Za-z][A-Za-z0-9]*)*$", maxLength: 128 },
    scalar: { type: ["string", "number", "boolean"] },
    sortKey: {
      type: "object",
      required: ["element"],
      additionalProperties: false,
      properties: { element: { $ref: "#/$defs/path" }, direction: { enum: ["asc", "desc"], default: "asc" } },
    },
    expression: {
      oneOf: [{ $ref: "#/$defs/condition" }, { $ref: "#/$defs/and" }, { $ref: "#/$defs/or" }, { $ref: "#/$defs/not" }],
    },
    and: {
      type: "object",
      required: ["and"],
      additionalProperties: false,
      properties: { and: { type: "array", minItems: 2, maxItems: MAX_GROUP_SIZE, items: { $ref: "#/$defs/expression" } } },
    },
    or: {
      type: "object",
      required: ["or"],
      additionalProperties: false,
      properties: { or: { type: "array", minItems: 2, maxItems: MAX_GROUP_SIZE, items: { $ref: "#/$defs/expression" } } },
    },
    not: { type: "object", required: ["not"], additionalProperties: false, properties: { not: { $ref: "#/$defs/expression" } } },
    condition: {
      type: "object",
      required: ["element", "op"],
      additionalProperties: false,
      properties: { element: { $ref: "#/$defs/path" }, op: { enum: [...QUERY_OPERATORS] }, value: {} },
      allOf: [
        { if: { properties: { op: { const: "pr" } } }, then: { not: { required: ["value"] } } },
        {
          if: { properties: { op: { const: "in" } } },
          then: {
            required: ["value"],
            properties: { value: { type: "array", minItems: 1, maxItems: MAX_IN_VALUES, items: { $ref: "#/$defs/scalar" } } },
          },
        },
        {
          if: { properties: { op: { enum: ["eq", "ne", "lt", "le", "gt", "ge", "sw", "co"] } } },
          then: { required: ["value"], properties: { value: { $ref: "#/$defs/scalar" } } },
        },
      ],
    },
  },
} as const;

let compiled: ReturnType<Ajv2020["compile"]> | undefined;

/** Checks a Query Object against the schema; it is never changed. */
export function validateQueryObject(value: unknown): ValidationResult {
  compiled ??= new Ajv2020({ strict: false, allErrors: true, logger: false }).compile(QUERY_OBJECT_SCHEMA);
  return compiled(value) ? { status: "valid" } : { status: "invalid", issues: toIssues(compiled.errors) };
}

export const isCondition = (expression: QueryExpression): expression is QueryCondition => "element" in expression;

/** Reads a result envelope; `undefined` when the body is not one. Results are kept as sent, whatever their type. */
export function parseQueryResults(body: unknown): QueryResults<unknown> | undefined {
  if (!isJsonObject(body) || !Array.isArray(body.results)) return undefined;
  return {
    results: body.results as unknown[],
    ...(typeof body.nextCursor === "string" && { nextCursor: body.nextCursor }),
    ...(typeof body.total === "number" && Number.isInteger(body.total) && { total: body.total }),
  };
}
