import { invalidRequest } from "./paths";

/** A JSON Patch operation (RFC 6902) as json §5.2 restricts and extends it. */
export type PatchOperation =
  | { op: "add"; path: string; value: unknown }
  | { op: "replace"; path: string; value: unknown; match?: Record<string, unknown> }
  | { op: "remove"; path: string; match?: Record<string, unknown> };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Checks what json §5.2.2 lets a server refuse outright, so that a broken patch is not sent. */
export function assertPatch(operations: readonly PatchOperation[]): void {
  const fail = (index: number, message: string): never => {
    throw invalidRequest(`Patch operation ${index}: ${message}`);
  };
  if (operations.length === 0) throw invalidRequest("A partial update needs at least one operation");
  operations.forEach((operation: Record<string, unknown>, index) => {
    if (!["add", "remove", "replace"].includes(operation.op as string)) {
      fail(index, `op must be add, remove or replace, not ${String(operation.op)}`);
    }
    if (typeof operation.path !== "string" || (operation.path !== "" && !operation.path.startsWith("/"))) {
      fail(index, "path must be a JSON Pointer");
    }
    if (operation.op !== "remove" && !("value" in operation)) fail(index, `${String(operation.op)} needs a value`);
    if (operation.op === "remove" && "value" in operation) fail(index, "remove takes no value");
    if (operation.match !== undefined) {
      if (operation.op === "add") fail(index, "add cannot be used with match");
      if (!isObject(operation.match)) fail(index, "match must be a JSON object");
    }
  });
}

const isPrimitive = (value: unknown): value is string | number | boolean | null =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

/**
 * Whether an array element matches (json §5.2.1): every member of `match` matches the member of that name. A primitive
 * matches the same type and value, an array of primitives the same set of values in any order, and an object when each
 * of its members matches in the same way (as in the draft's example `object: { "@type": "contact", id }`).
 */
export function matches(element: unknown, match: Record<string, unknown>): boolean {
  if (!isObject(element)) return false;
  return Object.entries(match).every(([key, wanted]) => memberMatches(element[key], wanted));
}

function memberMatches(actual: unknown, wanted: unknown): boolean {
  if (isPrimitive(wanted)) return actual === wanted;
  if (Array.isArray(wanted)) {
    if (!Array.isArray(actual) || !wanted.every(isPrimitive) || !actual.every(isPrimitive)) return false;
    const a = new Set(actual);
    const b = new Set(wanted);
    return a.size === b.size && [...a].every((value) => b.has(value));
  }
  return isObject(wanted) && matches(actual, wanted);
}

const unescape = (token: string) => token.replaceAll("~1", "/").replaceAll("~0", "~");

/**
 * Applies a partial update to a copy of an object, with the processing steps of json §5.2.2: `add` on an array appends,
 * `match` selects the elements to remove or the single one to replace, and `remove` without `match` removes the member.
 * Used to work out the object a full update sends, from the same edits a partial update would send. Throws when an
 * operation cannot apply, naming it; the input is never changed.
 */
export function applyPatch<T extends object>(
  target: T,
  operations: readonly PatchOperation[],
  options: {
    /**
     * Treat `remove` of a member the copy lacks as done, as when a read did not show it (authorisation information is
     * only shown on request). A server would refuse it; the copy cannot tell an absent member from a hidden one.
     */
    absentIsRemoved?: boolean;
  } = {},
): T {
  const result = structuredClone(target) as Record<string, unknown>;
  operations.forEach((operation, index) => {
    const fail = (message: string): never => {
      throw invalidRequest(`Patch operation ${index} (${operation.op} ${operation.path}): ${message}`);
    };
    const tokens = operation.path.split("/").slice(1).map(unescape);
    const last = tokens.pop();
    if (last === undefined) return fail("the whole object cannot be the target");
    let parent: unknown = result;
    for (const token of tokens) {
      parent = Array.isArray(parent) ? parent[Number(token)] : isObject(parent) ? parent[token] : undefined;
      if (!isObject(parent) && !Array.isArray(parent)) fail(`${token} does not exist`);
    }
    if (!isObject(parent)) return fail("the path does not lead to a member of an object");
    const current = parent[last];
    if (Array.isArray(current)) {
      if (operation.op !== "add" && operation.match) {
        const match = operation.match;
        const hits = current.filter((element) => matches(element, match));
        if (hits.length === 0) fail("no element matches");
        if (operation.op === "remove") parent[last] = current.filter((element) => !matches(element, match));
        else if (hits.length > 1) fail("more than one element matches");
        else parent[last] = current.map((element) => (matches(element, match) ? structuredClone(operation.value) : element));
        return;
      }
      if (operation.op === "add") {
        parent[last] = [...current, structuredClone(operation.value)];
        return;
      }
    } else if (operation.op !== "add" && operation.match) {
      fail("match needs an array");
    }
    if (operation.op === "remove") {
      if (!(last in parent) && !options.absentIsRemoved) fail(`${last} does not exist`);
      delete parent[last];
    } else {
      parent[last] = structuredClone(operation.value);
    }
  });
  return result as T;
}
