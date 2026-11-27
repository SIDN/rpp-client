import { isCondition, type QueryCondition, type QueryExpression, type QueryScalar } from "@/rpp/query/queryObject";
import { SEARCHABLE_ELEMENTS, type SearchableObjectType, type SearchValueType } from "@/rpp/query/searchable";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Every value at a dotted path. Arrays on the way are flattened, so an element is multi-valued when any member on its
 * path is an array; at a path prefix in `maps`, the values of the map are taken, as for an array.
 */
export function valuesAt(object: unknown, path: string, maps: readonly string[] = []): unknown[] {
  let current: unknown[] = [object];
  const segments = path.split(".");
  segments.forEach((segment, index) => {
    const next: unknown[] = [];
    for (const value of current.flatMap((item) => (Array.isArray(item) ? item : [item]))) {
      if (isRecord(value) && segment in value) next.push(value[segment]);
    }
    const prefix = segments.slice(0, index + 1).join(".");
    current = maps.includes(prefix) ? next.flatMap((value) => (isRecord(value) ? Object.values(value) : [value])) : next;
  });
  return current.flatMap((value) => (Array.isArray(value) ? value : [value])).filter((value) => value !== null && value !== undefined);
}

function compare(type: SearchValueType, actual: unknown, operand: QueryScalar): number | undefined {
  if (type === "timestamp") {
    const left = typeof actual === "string" ? Date.parse(actual) : Number.NaN;
    const right = typeof operand === "string" ? Date.parse(operand) : Number.NaN;
    return Number.isNaN(left) || Number.isNaN(right) ? undefined : left - right;
  }
  if (typeof actual === "number" && typeof operand === "number") return actual - operand;
  if (typeof actual === "string" && typeof operand === "string") return actual < operand ? -1 : actual > operand ? 1 : 0;
  if (typeof actual === "boolean" && typeof operand === "boolean") return Number(actual) - Number(operand);
  return undefined;
}

const equals = (type: SearchValueType, actual: unknown, operand: QueryScalar) => compare(type, actual, operand) === 0;

function matchesCondition(values: readonly unknown[], type: SearchValueType, condition: QueryCondition): boolean {
  switch (condition.op) {
    case "pr":
      return values.length > 0;
    case "eq":
      return values.some((value) => equals(type, value, condition.value));
    // Issue 210: ne holds when no value equals the operand, so also when there is none.
    case "ne":
      return !values.some((value) => equals(type, value, condition.value));
    case "in":
      return values.some((value) => condition.value.some((operand) => equals(type, value, operand)));
    case "lt":
    case "le":
    case "gt":
    case "ge": {
      const { op, value: operand } = condition;
      return values.some((value) => {
        const order = compare(type, value, operand);
        if (order === undefined) return false;
        return op === "lt" ? order < 0 : op === "le" ? order <= 0 : op === "gt" ? order > 0 : order >= 0;
      });
    }
    case "sw":
      return values.some((value) => typeof value === "string" && typeof condition.value === "string" && value.startsWith(condition.value));
    case "co":
      return values.some((value) => typeof value === "string" && typeof condition.value === "string" && value.includes(condition.value));
  }
}

/** Whether an object of the type satisfies the filter, with the operator semantics of issue 210. */
export function matches(objectType: SearchableObjectType, object: unknown, expression: QueryExpression | undefined): boolean {
  if (expression === undefined) return true;
  if (isCondition(expression)) {
    const element = SEARCHABLE_ELEMENTS[objectType].find((candidate) => candidate.path === expression.element);
    return matchesCondition(valuesAt(object, expression.element, element?.maps), element?.type ?? "string", expression);
  }
  if ("and" in expression) return expression.and.every((part) => matches(objectType, object, part));
  if ("or" in expression) return expression.or.some((part) => matches(objectType, object, part));
  return !matches(objectType, object, expression.not);
}

/** Orders by the first value of each sort key; objects without a value come last. */
export function sortKeyCompare(
  objectType: SearchableObjectType,
  sort: readonly { element: string; direction?: "asc" | "desc" }[],
): (left: unknown, right: unknown) => number {
  return (left, right) => {
    for (const key of sort) {
      const element = SEARCHABLE_ELEMENTS[objectType].find((candidate) => candidate.path === key.element);
      const a = valuesAt(left, key.element, element?.maps)[0];
      const b = valuesAt(right, key.element, element?.maps)[0];
      if (a === undefined || b === undefined) {
        if (a !== b) return a === undefined ? 1 : -1;
        continue;
      }
      const order = compare(element?.type ?? "string", a, b as QueryScalar) ?? 0;
      if (order !== 0) return key.direction === "desc" ? -order : order;
    }
    return 0;
  };
}
