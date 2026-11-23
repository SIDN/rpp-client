export const RESULT_CODE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "01000": "Command completed successfully",
  "01001": "Command completed successfully; action pending",
  "01300": "Command completed successfully; no messages",
  "01301": "Command completed successfully; ack to dequeue",
  "01500": "Command completed successfully; ending session",
  "02000": "Unknown command",
  "02001": "Command syntax error",
  "02002": "Command use error",
  "02003": "Required parameter missing",
  "02004": "Parameter value range error",
  "02005": "Parameter value syntax error",
  "02100": "Unimplemented protocol version",
  "02101": "Unimplemented command",
  "02102": "Unimplemented option",
  "02103": "Unimplemented extension",
  "02104": "Billing failure",
  "02105": "Object is not eligible for renewal",
  "02106": "Object is not eligible for transfer",
  "02200": "Authentication error",
  "02201": "Authorization error",
  "02202": "Invalid authorization information",
  "02300": "Object pending transfer",
  "02301": "Object not pending transfer",
  "02302": "Object exists",
  "02303": "Object does not exist",
  "02304": "Object status prohibits operation",
  "02305": "Object association prohibits operation",
  "02306": "Parameter value policy error",
  "02307": "Unimplemented object service",
  "02308": "Data management policy violation",
  "02400": "Command failed",
  "02500": "Command failed; server closing connection",
  "02501": "Authentication error; server closing connection",
  "02502": "Session limit exceeded; server closing connection",
};

// Core Table 9; any other code maps by class (Table 10).
const SPECIFIC_HTTP_STATUS: Readonly<Record<string, number>> = {
  "02002": 409,
  "02101": 501,
  "02102": 501,
  "02103": 501,
  "02104": 402,
  "02105": 409,
  "02106": 409,
  "02200": 401,
  "02201": 403,
  "02202": 401,
  "02300": 409,
  "02301": 409,
  "02302": 409,
  "02303": 404,
  "02304": 409,
  "02305": 409,
  "02306": 422,
  "02307": 501,
  "02308": 422,
  "02501": 401,
  "02502": 429,
};

const CATEGORIES = [
  "protocol syntax",
  "implementation-specific rules",
  "security",
  "data management",
  "server system",
  "connection management",
] as const;

export type ResultCategory = (typeof CATEGORIES)[number];

export interface ParsedResultCode {
  /** As received. */
  raw: string;
  /** Five digits, namespace 0 or 1, class 1 or 2, category 0-5 (core §18). Otherwise nothing below is derived. */
  wellFormed: boolean;
  /** 0 derives from EPP, 1 is RPP-specific. */
  namespace: "epp-derived" | "rpp-specific" | undefined;
  outcome: "success" | "failure" | undefined;
  category: ResultCategory | undefined;
  /** Listed in the registry of core Table 11. */
  known: boolean;
  description: string;
}

const WELL_FORMED = /^([01])([12])([0-5])\d\d$/;

export function parseResultCode(raw: string): ParsedResultCode {
  const match = WELL_FORMED.exec(raw);
  const known = raw in RESULT_CODE_DESCRIPTIONS;
  if (!match) {
    return {
      raw,
      wellFormed: false,
      namespace: undefined,
      outcome: undefined,
      category: undefined,
      known,
      description: `Malformed result code ${JSON.stringify(raw)}`,
    };
  }
  const [, namespace, outcome, category] = match;
  const parsedCategory = CATEGORIES[Number(category)];
  const parsedOutcome = outcome === "1" ? "success" : "failure";
  return {
    raw,
    wellFormed: true,
    namespace: namespace === "0" ? "epp-derived" : "rpp-specific",
    outcome: parsedOutcome,
    category: parsedCategory,
    known,
    description:
      RESULT_CODE_DESCRIPTIONS[raw] ??
      `Unlisted result code ${raw} (${parsedOutcome}, ${parsedCategory})`,
  };
}

/** The HTTP status that core §18.1 maps a result code to; undefined for a malformed code. */
export function expectedHttpStatus(code: ParsedResultCode): number | undefined {
  if (!code.wellFormed) return undefined;
  if (code.outcome === "success") return 200;
  const specific = SPECIFIC_HTTP_STATUS[code.raw];
  if (specific !== undefined) return specific;
  return code.category === "server system" || code.category === "connection management" ? 500 : 400;
}
