import { isJsonObject } from "@/rpp/core/types/json";
import type { PatchOperation } from "@/rpp/operations/patch";
import { invalidRequest } from "@/rpp/operations/paths";

const unescape = (token: string) => token.replace(/~1/g, "/").replace(/~0/g, "~");

/** Every member of `match` is in `value` with the same value; nested objects are matched the same way. */
function matches(value: unknown, match: Record<string, unknown>): boolean {
  if (!isJsonObject(value)) return false;
  return Object.entries(match).every(([key, wanted]) => (isJsonObject(wanted) ? matches(value[key], wanted) : value[key] === wanted));
}

/**
 * Applies a partial update to a copy of a made-up object, the way json §5.2 reads one: `add` to an array appends,
 * `remove` and `replace` with `match` act on the array members that match, and otherwise a member is set or deleted.
 * It is only used for data this client made up itself; a server's object is only ever changed by the server.
 */
export function applyPatch<T extends object>(object: T, operations: readonly PatchOperation[]): T {
  const copy = structuredClone(object) as Record<string, unknown>;
  for (const operation of operations) {
    const fail = () => invalidRequest(`${operation.op} ${operation.path}`);
    const tokens = operation.path.split("/").slice(1).map(unescape);
    const last = tokens.pop();
    if (last === undefined) throw fail();
    let target: unknown = copy;
    for (const token of tokens) target = isJsonObject(target) ? target[token] : undefined;
    if (!isJsonObject(target)) throw fail();

    const member = target[last];
    if (operation.op === "add") {
      if (Array.isArray(member)) member.push(structuredClone(operation.value));
      else target[last] = structuredClone(operation.value);
    } else if (operation.match !== undefined) {
      if (!Array.isArray(member)) throw fail();
      const { match } = operation;
      target[last] =
        operation.op === "remove"
          ? member.filter((entry) => !matches(entry, match))
          : member.map((entry) => (matches(entry, match) ? structuredClone(operation.value) : entry));
    } else if (operation.op === "remove") {
      delete target[last];
    } else {
      target[last] = structuredClone(operation.value);
    }
  }
  return copy as T;
}
