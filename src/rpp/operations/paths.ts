import { isAscii } from "../core/idn";
import { RppError } from "../errors/RppError";

/** A request that is not sent because it cannot be right, such as an operation the resource does not have. */
export function invalidRequest(message: string): RppError {
  return new RppError({ kind: "transport", transportKind: "invalid-request", message, exchangeId: undefined });
}

/** One path segment for an identifier, percent-encoded. Rejects what could change the path or is not allowed in it. */
export function segment(value: string, label: string, aLabel = false): string {
  if (value === "") throw invalidRequest(`${label} must not be empty`);
  if (value === "." || value === "..") throw invalidRequest(`${label} is not a usable path segment`);
  if (aLabel && !isAscii(value)) {
    throw invalidRequest(`${label} must be the A-label form of the name in a URL (core §16.3); convert it with toALabel()`);
  }
  return encodeURIComponent(value);
}
