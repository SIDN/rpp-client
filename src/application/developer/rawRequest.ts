import { OWNED_HEADERS } from "@/rpp/client/FetchTransport";
import type { RequestSnapshot } from "@/rpp/client/diagnostics";
import { REDACTED } from "@/rpp/client/redaction";
import { t } from "@/i18n";
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
  /** True sends `standardHeaders`, replacing the headers the client sets itself. */
  setStandardHeaders: boolean;
  /** One `Name: value` per line, only headers the client owns (Accept, Content-Type, RPP-Preset, RPP-Cltrid, credentials). */
  standardHeaders: string;
}

export type RawRequestField = keyof RawRequestForm;

export interface RawRequestProblem {
  field: RawRequestField;
  message: string;
}

export type RawRequestResult = { ok: true; request: RppRequest } | { ok: false; problems: RawRequestProblem[] };

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

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
    if (!HEADER_NAME.test(name)) return fail("headers", t("developer.validation.headerFormat", { line: index + 1 }));
    if (OWNED_HEADERS.has(name.toLowerCase())) return fail("headers", t("developer.validation.headerOwned", { name }));
    headers[name] = line.slice(split + 1).trim();
  });

  const standard: Record<string, string> = {};
  if (form.setStandardHeaders) {
    lines(form.standardHeaders).forEach((line, index) => {
      const split = line.indexOf(":");
      const name = split < 0 ? "" : line.slice(0, split).trim();
      if (!HEADER_NAME.test(name)) return fail("standardHeaders", t("developer.validation.headerFormat", { line: index + 1 }));
      if (!OWNED_HEADERS.has(name.toLowerCase())) return fail("standardHeaders", t("developer.validation.standardHeaderUnknown", { name }));
      if (name.toLowerCase() === "rpp-cltrid" && form.clientTransactionId.trim() !== "") return fail("standardHeaders", t("developer.validation.transactionIdTwice"));
      standard[name] = line.slice(split + 1).trim();
    });
  }

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
      ...(Object.keys(standard).length > 0 && { headerOverrides: standard }),
      ...(body !== undefined && { body }),
      ...(clientTransactionId !== "" && { clientTransactionId }),
      ...(!form.authenticate && { authenticate: false }),
    },
  };
}

/** Search parameter of the raw request screen naming a recorded exchange whose request fills in the form. */
export const FROM_EXCHANGE_PARAM = "exchange";

/** Headers in a recorded request that show credentials were attached (the authentication providers set these). */
const CREDENTIAL_HEADERS: ReadonlySet<string> = new Set(["authorization", "proxy-authorization", "cookie"]);

/** The path below the base URL when the address is under it, so the form shows what one would type; else the address. */
function targetFor(url: URL, baseUrl: string): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return `${url.origin}${url.pathname}`;
  }
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  return url.origin === base.origin && url.pathname.startsWith(basePath) && url.pathname !== basePath
    ? url.pathname.slice(basePath.length)
    : `${url.origin}${url.pathname}`;
}

/**
 * The raw request form filled in with a recorded request, values as recorded: redacted values stay "[REDACTED]" and
 * are sent as such unless replaced. Of the headers the client owns, RPP-Cltrid goes to its own field and Accept,
 * Content-Type and RPP-Preset to the standard headers, which are switched on. Credentials are not copied, since the
 * recorded value is only "[REDACTED]": a credential header turns "send credentials" on, so the connection's are sent.
 * Undefined when the request cannot be expressed in the form (no resolved address, or an unknown method).
 */
export function formFromRequest(request: RequestSnapshot, baseUrl: string): RawRequestForm | undefined {
  const method = RAW_METHODS.find((known) => known === request.method);
  if (!method) return undefined;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return undefined;
  }
  const headerLines = (keep: (name: string) => boolean) =>
    Object.entries(request.headers)
      .filter(([name]) => keep(name.toLowerCase()))
      .map(([name, value]) => `${name}: ${value}`)
      .join("\n");
  const standardHeaders = headerLines((name) => OWNED_HEADERS.has(name) && name !== "rpp-cltrid" && !CREDENTIAL_HEADERS.has(name));
  return {
    method,
    target: targetFor(url, baseUrl),
    query: [...url.searchParams].map(([name, value]) => `${name}=${value}`).join("\n"),
    headers: headerLines((name) => !OWNED_HEADERS.has(name)),
    body: request.body ?? "",
    clientTransactionId: request.headers["rpp-cltrid"] ?? "",
    authenticate: Object.keys(request.headers).some((name) => CREDENTIAL_HEADERS.has(name.toLowerCase())),
    setStandardHeaders: standardHeaders !== "",
    standardHeaders,
  };
}

/** True when the form holds a value that was redacted when it was recorded. */
export function holdsRedactedValue(form: RawRequestForm): boolean {
  return [form.target, form.query, form.headers, form.standardHeaders, form.body].some((text) => text.includes(REDACTED));
}
