import { OWNED_HEADERS } from "@/rpp/client/FetchTransport";
import type { HttpMethod, RppRequest } from "@/rpp/client/request";

export const RAW_METHODS: readonly HttpMethod[] = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];

/** What the raw request form holds, as typed. */
export interface RawRequestForm {
  method: HttpMethod;
  /** A path relative to the server address, or an absolute URL on an allowed origin. */
  target: string;
  /** One `name=value` per line; a name may repeat. */
  query: string;
  /** One `Name: value` per line. */
  headers: string;
  /** JSON text; empty for no body. */
  body: string;
  /** RPP-Cltrid; empty to let the client make one. */
  clientTransactionId: string;
  /** False leaves the credentials out of the request. */
  authenticate: boolean;
}

export type RawRequestField = keyof RawRequestForm;

export interface RawRequestProblem {
  field: RawRequestField;
  message: string;
}

export type RawRequestResult = { ok: true; request: RppRequest } | { ok: false; problems: RawRequestProblem[] };

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * Turns the form into a request exactly as typed: nothing is added, normalized or rewritten, so what is sent is what was
 * entered. Only what cannot be sent at all is refused. The server decides whether the request is valid.
 */
export function buildRawRequest(form: RawRequestForm): RawRequestResult {
  const problems: RawRequestProblem[] = [];
  const fail = (field: RawRequestField, message: string) => problems.push({ field, message });

  const target = form.target.trim();
  if (target === "") fail("target", "Enter a path, such as domainNames/example.nl, or a full address");

  const query: Record<string, string | string[]> = {};
  lines(form.query).forEach((line, index) => {
    const split = line.indexOf("=");
    const name = (split < 0 ? line : line.slice(0, split)).trim();
    if (name === "") return fail("query", `Query line ${index + 1}: the name is empty`);
    const value = split < 0 ? "" : line.slice(split + 1);
    const known = query[name];
    query[name] = known === undefined ? value : [...(Array.isArray(known) ? known : [known]), value];
  });

  const headers: Record<string, string> = {};
  lines(form.headers).forEach((line, index) => {
    const split = line.indexOf(":");
    const name = split < 0 ? "" : line.slice(0, split).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return fail("headers", `Header line ${index + 1}: write it as Name: value`);
    if (OWNED_HEADERS.has(name.toLowerCase())) return fail("headers", `${name} is set by the client; use its own field or setting`);
    headers[name] = line.slice(split + 1).trim();
  });

  let body: unknown;
  if (form.body.trim() !== "") {
    if (form.method === "GET" || form.method === "HEAD") fail("body", `${form.method} requests have no body`);
    try {
      body = JSON.parse(form.body);
    } catch (error) {
      fail("body", `The body is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const clientTransactionId = form.clientTransactionId.trim();
  if (clientTransactionId !== "" && !/^[\x20-\x7e]+$/.test(clientTransactionId)) fail("clientTransactionId", "RPP-Cltrid must be printable ASCII");

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    request: {
      method: form.method,
      target,
      ...(Object.keys(query).length > 0 && { query }),
      ...(Object.keys(headers).length > 0 && { headers }),
      ...(body !== undefined && { body }),
      ...(clientTransactionId !== "" && { clientTransactionId }),
      ...(!form.authenticate && { authenticate: false }),
    },
  };
}
