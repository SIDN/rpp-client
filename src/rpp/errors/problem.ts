import { isJsonObject } from "../core/types/json";
import { parseResultCode, type ParsedResultCode } from "../core/status/resultCodes";

export const RPP_ERROR_TYPE = "urn:ietf:params:rpp:error";

/** One entry of the `errors` list of a Problem Detail (core §9). */
export interface RppProblemError {
  type: string;
  result: ParsedResultCode;
  /** JSONPaths (RFC 9535) into the request. */
  paths: string[];
  reason: string;
  /** Members the specification leaves to extensions (a billing balance, a `profile`, ...), kept as received. */
  extensions: Record<string, unknown>;
}

export interface RppProblem {
  title: string;
  /** The `detail` member (RFC 9457): what went wrong in this occurrence. */
  detail: string | undefined;
  status: number | undefined;
  errors: RppProblemError[];
  /** Members of the document other than `type`, `title`, `detail`, `status` and `errors`. */
  extensions: Record<string, unknown>;
  /** What the document gets wrong against core §9; a lenient reading never fails. */
  warnings: string[];
}

const ERROR_MEMBERS = new Set(["type", "result", "paths", "reason"]);
const PROBLEM_MEMBERS = new Set(["type", "title", "detail", "status", "errors"]);

function extensionsOf(object: Record<string, unknown>, known: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !known.has(key)));
}

/** Reads an RPP Problem Detail; undefined when the value is not one (its `type` is not the RPP error URN). */
export function parseRppProblem(value: unknown): RppProblem | undefined {
  if (!isJsonObject(value) || value.type !== RPP_ERROR_TYPE) return undefined;
  const warnings: string[] = [];

  if (typeof value.title !== "string") warnings.push("title: expected a string");
  if (value.status !== undefined && typeof value.status !== "number") warnings.push("status: expected a number");

  const errors: RppProblemError[] = [];
  if (!Array.isArray(value.errors)) warnings.push("errors: expected an array");
  else {
    value.errors.forEach((entry: unknown, index) => {
      if (!isJsonObject(entry)) {
        warnings.push(`errors/${index}: expected an object; entry ignored`);
        return;
      }
      if (typeof entry.result !== "string") warnings.push(`errors/${index}/result: expected a string`);
      if (typeof entry.reason !== "string") warnings.push(`errors/${index}/reason: expected a string`);
      if (entry.paths !== undefined && !Array.isArray(entry.paths)) warnings.push(`errors/${index}/paths: expected an array`);
      errors.push({
        type: typeof entry.type === "string" ? entry.type : "",
        result: parseResultCode(typeof entry.result === "string" ? entry.result : ""),
        paths: Array.isArray(entry.paths) ? entry.paths.filter((path): path is string => typeof path === "string") : [],
        reason: typeof entry.reason === "string" ? entry.reason : "",
        extensions: extensionsOf(entry, ERROR_MEMBERS),
      });
    });
  }

  return {
    title: typeof value.title === "string" ? value.title : "",
    detail: typeof value.detail === "string" ? value.detail : undefined,
    status: typeof value.status === "number" ? value.status : undefined,
    errors,
    extensions: extensionsOf(value, PROBLEM_MEMBERS),
    warnings,
  };
}
