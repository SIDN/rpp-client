import { OWNED_HEADERS } from "@/rpp/client/FetchTransport";
import { t } from "@/i18n";
import type { RequestSnapshot } from "@/rpp/client/diagnostics";
import { REDACTED } from "@/rpp/client/redaction";
import type { HttpMethod, RppRequest } from "@/rpp/client/request";

export const RAW_METHODS: readonly HttpMethod[] = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE", "QUERY"];

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
  if (target === "") fail("target", t("developer.validation.targetRequired"));

  const query: Record<string, string | string[]> = {};
  lines(form.query).forEach((line, index) => {
    const split = line.indexOf("=");
    const name = (split < 0 ? line : line.slice(0, split)).trim();
    if (name === "") return fail("query", t("developer.validation.queryNameEmpty", { line: index + 1 }));
    const value = split < 0 ? "" : line.slice(split + 1);
    const known = query[name];
    query[name] = known === undefined ? value : [...(Array.isArray(known) ? known : [known]), value];
  });

  const headers: Record<string, string> = {};
  lines(form.headers).forEach((line, index) => {
    const split = line.indexOf(":");
    const name = split < 0 ? "" : line.slice(0, split).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return fail("headers", t("developer.validation.headerFormat", { line: index + 1 }));
    if (OWNED_HEADERS.has(name.toLowerCase())) return fail("headers", t("developer.validation.headerOwned", { name }));
    headers[name] = line.slice(split + 1).trim();
  });

  let body: unknown;
  if (form.body.trim() !== "") {
    if (form.method === "GET" || form.method === "HEAD") fail("body", t("developer.validation.methodHasNoBody", { method: form.method }));
    try {
      body = JSON.parse(form.body);
    } catch (error) {
      fail("body", t("developer.validation.invalidJson", { message: error instanceof Error ? error.message : String(error) }));
    }
  }

  const clientTransactionId = form.clientTransactionId.trim();
  if (clientTransactionId !== "" && !/^[\x20-\x7e]+$/.test(clientTransactionId)) fail("clientTransactionId", t("developer.validation.transactionIdAscii"));

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

const AUTHORIZATION_HEADERS = ["authorization", "proxy-authorization", "rpp-authorization"];

/**
 * The raw request form for sending a recorded request again. The record holds what was sent after redaction, so secrets
 * are gone: credentials are added again by the connection (`authenticate`), and any other value that was redacted is left
 * as `[REDACTED]` for the user to replace; `hasRedactions` says whether there is one. Headers the transport owns
 * (RPP-Cltrid, Accept, Content-Type, ...) are left out, so a replay gets a new transaction id.
 */
export function formFromExchange(request: RequestSnapshot, baseUrl: string): { form: RawRequestForm; hasRedactions: boolean } {
  let target = request.url;
  let query = "";
  try {
    const url = new URL(request.url);
    const base = new URL(baseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    target = url.origin === base.origin && url.pathname.startsWith(base.pathname) ? url.pathname.slice(base.pathname.length) : `${url.origin}${url.pathname}`;
    query = [...url.searchParams].map(([name, value]) => `${name}=${value}`).join("\n");
  } catch {
    // An address that does not parse is shown as recorded, for the user to fix.
  }

  const headers = Object.entries(request.headers).filter(([name]) => !OWNED_HEADERS.has(name.toLowerCase()));
  const body = request.body === undefined ? "" : formatJson(request.body);
  const method = RAW_METHODS.find((known) => known === request.method.toUpperCase()) ?? "GET";

  return {
    form: {
      method,
      target,
      query,
      headers: headers.map(([name, value]) => `${name}: ${value}`).join("\n"),
      body,
      clientTransactionId: "",
      authenticate: AUTHORIZATION_HEADERS.some((name) => request.headers[name] === REDACTED),
    },
    hasRedactions: [query, body, ...headers.map(([, value]) => value)].some((text) => text.includes(REDACTED)),
  };
}

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
