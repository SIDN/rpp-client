import type { ExchangeRecord } from "@/rpp/client/diagnostics";
import type { Tone } from "@/components/ui/badge-variants";
import { t } from "@/i18n";

export interface ExchangeSummary {
  method: string;
  /** Path and query; the origin is the same for the whole session. */
  target: string;
  /** What the badge says: the HTTP status, or why there was none. */
  outcome: string;
  tone: Exclude<Tone, "neutral">;
  resultCode: string | undefined;
}

export function targetOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function summarize(record: ExchangeRecord): ExchangeSummary {
  const { outcome, request } = record;
  const base = { method: request.method, target: targetOf(request.url) };
  if (outcome.kind === "error") {
    return { ...base, outcome: t("exchanges.summary.noResponse"), tone: "danger", resultCode: undefined };
  }
  const tone = outcome.status >= 400 ? "danger" : outcome.status >= 300 ? "warning" : "success";
  return { ...base, outcome: String(outcome.status), tone, resultCode: outcome.headers["rpp-code"] };
}

/** Pretty-printed when the body is complete JSON; anything else, including a clipped body, is shown as it is. */
export function formatBody(text: string): { text: string; formatted: boolean } {
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), formatted: true };
  } catch {
    return { text, formatted: false };
  }
}

/** Newest first; every word of the query has to occur in the method, address, status, result code or transaction ids. */
export function filterExchanges(records: readonly ExchangeRecord[], query: string): ExchangeRecord[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const newestFirst = [...records].reverse();
  if (words.length === 0) return newestFirst;
  return newestFirst.filter((record) => {
    const summary = summarize(record);
    const headers = record.outcome.kind === "response" ? record.outcome.headers : {};
    const haystack = [
      summary.method,
      summary.target,
      summary.outcome,
      summary.resultCode,
      record.request.headers["rpp-cltrid"],
      headers["rpp-svtrid"],
    ]
      .join(" ")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/*
 * Raw text of an exchange, for pasting into a bug report or a terminal. It is built only from the recorded
 * (already redacted) snapshot, so redacted values stay "[REDACTED]" and nothing is re-read from the live request.
 * The HTTP version is left out because fetch does not expose it; header names are lower case as recorded; bodies
 * are as recorded, not pretty-printed. A clipped body or a missing response is marked on a "#" line, since
 * presenting either as a complete message would mislead; so is a redirect.
 */
function message(startLine: string, headers: Record<string, string>, body: string | undefined): string {
  const lines = [startLine, ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`)];
  return body === undefined ? lines.join("\n") : `${lines.join("\n")}\n\n${body}`;
}

export function rawRequest(record: ExchangeRecord): string {
  const { method, url, headers, body } = record.request;
  return message(`${method} ${url}`, headers, body);
}

export function rawResponse(record: ExchangeRecord): string {
  const { outcome } = record;
  if (outcome.kind === "error") return `# No response (${outcome.errorKind}): ${outcome.message}`;
  const text = message(`HTTP ${outcome.status} ${outcome.statusText}`.trim(), outcome.headers, outcome.body);
  const redirect = outcome.redirected ? `# Redirected: the response came from ${outcome.url}\n` : "";
  return `${redirect}${text}${outcome.bodyTruncated ? "\n# Body truncated: only the first part was recorded." : ""}`;
}

export function rawExchange(record: ExchangeRecord): string {
  return `${rawRequest(record)}\n\n${rawResponse(record)}`;
}
