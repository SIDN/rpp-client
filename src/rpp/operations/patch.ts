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
