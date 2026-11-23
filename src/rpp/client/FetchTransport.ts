import type { ExchangeOutcome, ExchangeRecord, RequestSnapshot } from "./diagnostics";
import {
  PRESET_HEADER,
  PROBLEM_MEDIA_TYPE,
  RPP_MEDIA_TYPE,
  buildAccept,
  buildContentType,
  buildPresetHeaderValue,
  isAcceptedBy,
  isJsonMediaType,
  parseMediaType,
} from "./negotiation";
import { redactHeaders, redactJsonText, redactUrl } from "./redaction";
import type { ProgressEvent } from "./progress";
import type { RppRequest } from "./request";
import type { ResponseBody, RppHttpResponse } from "./response";
import type { RppTransport, TransportConfig } from "./RppTransport";
import { assertAllowed, createOriginPolicy, resolveTarget } from "./url";
import { createClientTransactionIdGenerator } from "./transactionId";
import { TransportError } from "../errors/TransportError";

const BODILESS_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);
const OWNED_HEADERS: ReadonlySet<string> = new Set([
  "accept",
  "content-type",
  PRESET_HEADER.toLowerCase(),
  "rpp-cltrid",
  "authorization",
  "proxy-authorization",
  "cookie",
]);
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const NO_CONTENT_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

interface Prepared {
  url: URL;
  headers: Headers;
  bodyText: string | undefined;
  clientTransactionId: string;
  expectedMediaTypes: readonly string[];
}

interface AbortControl {
  signal: AbortSignal;
  timedOut(): boolean;
  externallyAborted(): boolean;
  dispose(): void;
}

function createAbortControl(external: AbortSignal | undefined, timeoutMs: number): AbortControl {
  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => controller.abort(external?.reason);
  if (external?.aborted) controller.abort(external.reason);
  else external?.addEventListener("abort", onExternalAbort, { once: true });
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort(new Error(`Request timed out after ${timeoutMs} ms`));
        }, timeoutMs)
      : undefined;
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    externallyAborted: () => external?.aborted ?? false,
    dispose() {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // the connection is dropped either way
  }
}

export function createFetchTransport(config: TransportConfig): RppTransport {
  const policy = createOriginPolicy(config);
  const defaultTimeoutMs = config.timeoutMs ?? 30_000;
  const redirectPolicy = config.redirectPolicy ?? "reject";
  const sensitiveHeaders = new Set((config.sensitiveHeaders ?? []).map((name) => name.toLowerCase()));
  const maxBodyChars = config.maxDiagnosticBodyChars ?? 100_000;
  const doFetch: typeof fetch = config.fetch ?? ((input, init) => globalThis.fetch(input, init));
  let sequence = 0;
  const newClientTransactionId = config.newClientTransactionId ?? createClientTransactionIdGenerator();

  const clip = (text: string) =>
    text.length > maxBodyChars
      ? { text: text.slice(0, maxBodyChars), truncated: true }
      : { text, truncated: false };

  function emit(record: ExchangeRecord): void {
    try {
      config.onExchange?.(record);
    } catch {
      // a faulty diagnostics listener must not change the outcome of a request
    }
  }

  function progress(event: ProgressEvent): void {
    try {
      config.onProgress?.(event);
    } catch {
      // as for emit
    }
  }

  async function prepare(request: RppRequest, snapshot: RequestSnapshot): Promise<Prepared> {
    if (request.body !== undefined && BODILESS_METHODS.has(request.method)) {
      throw new TransportError("invalid-request", `${request.method} requests have no body`);
    }
    let bodyText: string | undefined;
    if (request.body !== undefined) {
      try {
        bodyText = JSON.stringify(request.body);
      } catch (cause) {
        throw new TransportError("invalid-request", "Body is not JSON-serializable", { cause });
      }
      if (bodyText === undefined) throw new TransportError("invalid-request", "Body is not JSON-serializable");
    }

    const url = resolveTarget(policy, request.target);
    for (const [name, value] of Object.entries(request.query ?? {})) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined) url.searchParams.append(name, String(item));
      }
    }
    snapshot.url = redactUrl(url);
    assertAllowed(policy, url);

    const headers = new Headers();
    let clientTransactionId: string;
    try {
      for (const [name, value] of Object.entries(request.headers ?? {})) {
        if (OWNED_HEADERS.has(name.toLowerCase())) {
          throw new TransportError("invalid-request", `Header is set by the transport: ${name}`);
        }
        headers.set(name, value);
      }
      if (request.clientTransactionId !== undefined && !PRINTABLE_ASCII.test(request.clientTransactionId)) {
        throw new TransportError("invalid-request", "RPP-Cltrid must be printable ASCII");
      }
      // Core §6.1: every request has one, also those the client makes by itself.
      clientTransactionId = request.clientTransactionId ?? newClientTransactionId();
      headers.set("RPP-Cltrid", clientTransactionId);
    } catch (error) {
      if (error instanceof TransportError) throw error;
      throw new TransportError("invalid-request", "Invalid request header", { cause: error });
    }

    const configured = typeof config.preset === "function" ? config.preset() : config.preset;
    const preset = request.preset === undefined ? configured : (request.preset ?? undefined);
    const presetHeader = buildPresetHeaderValue(preset);
    if (presetHeader !== undefined) headers.set(PRESET_HEADER, presetHeader);

    const accept = request.accept ?? config.accept ?? [RPP_MEDIA_TYPE];
    headers.set("Accept", buildAccept(accept, preset));
    // With media type signalling the preset is also named in the Content-Type of a request without content.
    if (bodyText !== undefined || preset?.method === "media-type") {
      headers.set("Content-Type", buildContentType(preset));
    }

    snapshot.headers = redactHeaders(headers, sensitiveHeaders);
    if (bodyText !== undefined) snapshot.body = clip(redactJsonText(bodyText)).text;

    if (config.authorizationHeaders && request.authenticate !== false && url.origin === policy.base.origin) {
      try {
        const authorization = await config.authorizationHeaders({ method: request.method, url: new URL(url.href) });
        for (const [name, value] of Object.entries(authorization)) headers.set(name, value);
      } catch (cause) {
        throw new TransportError("authentication", "Could not obtain authorization headers", { cause });
      }
      snapshot.headers = redactHeaders(headers, sensitiveHeaders);
    }

    return { url, headers, bodyText, clientTransactionId, expectedMediaTypes: [...accept, PROBLEM_MEDIA_TYPE] };
  }

  async function checkRedirect(response: Response, requested: URL): Promise<void> {
    if (redirectPolicy === "reject") {
      if (response.type !== "opaqueredirect" && !REDIRECT_STATUSES.has(response.status)) return;
      await discard(response);
      let target = "";
      const location = response.headers.get("location");
      if (location) {
        try {
          target = ` to ${redactUrl(new URL(location, requested))}`;
        } catch {
          target = " to an unparseable location";
        }
      }
      throw new TransportError("redirect-blocked", `Redirect${target} was not followed (status ${response.status || "hidden"})`);
    }
    if (response.redirected && response.url) {
      try {
        assertAllowed(policy, new URL(response.url));
      } catch (error) {
        await discard(response);
        throw error;
      }
    }
  }

  async function readBody(
    response: Response,
    method: string,
    expectedMediaTypes: readonly string[],
  ): Promise<ResponseBody> {
    if (method === "HEAD" || NO_CONTENT_STATUSES.has(response.status)) {
      await discard(response);
      return { kind: "empty" };
    }
    const text = await response.text();
    if (text === "") return { kind: "empty" };

    const header = response.headers.get("content-type");
    const mediaType = header ? parseMediaType(header) : undefined;
    if (!mediaType || !isJsonMediaType(mediaType) || !isAcceptedBy(mediaType, expectedMediaTypes)) {
      return { kind: "unexpected-media-type", text, mediaType: header };
    }
    const essence = `${mediaType.type}/${mediaType.subtype}`;
    try {
      return { kind: "json", value: JSON.parse(text) as unknown, text, mediaType: essence };
    } catch (error) {
      return { kind: "malformed-json", text, mediaType: essence, message: error instanceof Error ? error.message : String(error) };
    }
  }

  function toTransportError(error: unknown, abort: AbortControl): TransportError {
    if (error instanceof TransportError) return error;
    if (abort.timedOut()) return new TransportError("timeout", "Request timed out", { cause: error });
    if (abort.externallyAborted() || (error instanceof DOMException && error.name === "AbortError")) {
      return new TransportError("aborted", "Request was aborted", { cause: error });
    }
    const detail = error instanceof Error ? `: ${error.message}` : "";
    return new TransportError("network", `Network request failed${detail}`, { cause: error });
  }

  async function send(request: RppRequest): Promise<RppHttpResponse> {
    const id = `${Date.now().toString(36)}-${++sequence}`;
    const startedAt = new Date().toISOString();
    const startedMs = performance.now();
    const snapshot: RequestSnapshot = { method: request.method, url: "(unresolved)", headers: {}, body: undefined };
    const abort = createAbortControl(request.signal, request.timeoutMs ?? defaultTimeoutMs);
    progress({ id, phase: "started", method: request.method, at: startedMs });
    const record = (outcome: ExchangeOutcome): ExchangeRecord => {
      const exchange: ExchangeRecord = {
        id,
        startedAt,
        durationMs: Math.round(performance.now() - startedMs),
        request: { ...snapshot },
        outcome,
      };
      emit(exchange);
      return exchange;
    };

    try {
      const { url, headers, bodyText, clientTransactionId, expectedMediaTypes } = await prepare(request, snapshot);
      progress({ id, phase: "sent", url: snapshot.url, clientTransactionId, at: performance.now() });
      const response = await doFetch(url, {
        method: request.method,
        headers,
        body: bodyText,
        redirect: redirectPolicy === "reject" ? "manual" : "follow",
        credentials: config.credentials ?? "omit",
        referrerPolicy: "no-referrer",
        signal: abort.signal,
      });
      progress({ id, phase: "headers", status: response.status, at: performance.now() });
      await checkRedirect(response, url);
      const body = await readBody(response, request.method, expectedMediaTypes);
      progress({ id, phase: "read", at: performance.now() });

      const finalUrl = response.url || url.href;
      const diagnosticBody =
        body.kind === "empty" ? undefined : clip(body.kind === "json" ? redactJsonText(body.text) : body.text);
      const exchange = record({
        kind: "response",
        status: response.status,
        statusText: response.statusText,
        url: redactUrl(new URL(finalUrl)),
        redirected: response.redirected,
        headers: redactHeaders(response.headers, sensitiveHeaders),
        body: diagnosticBody?.text,
        bodyTruncated: diagnosticBody?.truncated ?? false,
      });
      progress({ id, phase: "finished", outcome: "response", at: performance.now() });
      return {
        status: response.status,
        statusText: response.statusText,
        url: finalUrl,
        redirected: response.redirected,
        headers: response.headers,
        body,
        sentClientTransactionId: clientTransactionId,
        correlation: {
          clientTransactionId: response.headers.get("RPP-Cltrid"),
          serverTransactionId: response.headers.get("RPP-Svtrid"),
          resultCode: response.headers.get("RPP-Code"),
        },
        exchangeId: id,
        durationMs: exchange.durationMs,
      };
    } catch (error) {
      const failure = toTransportError(error, abort);
      failure.exchange = record({ kind: "error", errorKind: failure.kind, message: failure.message });
      progress({ id, phase: "finished", outcome: "error", at: performance.now() });
      throw failure;
    } finally {
      abort.dispose();
    }
  }

  return { send };
}
