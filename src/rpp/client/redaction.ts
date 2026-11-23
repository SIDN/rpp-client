export const REDACTED = "[REDACTED]";

const SENSITIVE_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "proxy-authorization",
  "rpp-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
]);

// Names of JSON properties and query parameters whose values are secrets (authInfo is an RPP/EPP transfer secret).
const SENSITIVE_NAME = /pass(word|phrase)?|secret|token|auth[-_]?info|authorization|credential|^pw$/i;

export function redactHeaders(
  headers: Headers,
  extraSensitive: ReadonlySet<string> = new Set(),
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of headers) {
    const lower = name.toLowerCase();
    result[lower] = SENSITIVE_HEADERS.has(lower) || extraSensitive.has(lower) ? REDACTED : value;
  }
  return result;
}

export function redactUrl(url: URL): string {
  const copy = new URL(url.href);
  copy.username = "";
  copy.password = "";
  copy.hash = "";
  for (const key of new Set(copy.searchParams.keys())) {
    if (SENSITIVE_NAME.test(key)) copy.searchParams.set(key, REDACTED);
  }
  return copy.href;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      result[key] = SENSITIVE_NAME.test(key) ? REDACTED : redactValue(inner);
    }
    return result;
  }
  return value;
}

/** Redacts sensitive properties of a JSON text; text that is not JSON is returned unchanged. */
export function redactJsonText(text: string): string {
  try {
    return JSON.stringify(redactValue(JSON.parse(text)));
  } catch {
    return text;
  }
}
