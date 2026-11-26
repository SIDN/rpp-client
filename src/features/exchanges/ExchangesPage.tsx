import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy, Terminal, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useConnection } from "@/app/connection-context";
import { EmptyState, PageHeader, Section } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { ResultCodeChip } from "@/components/protocol/protocol-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { REDACTED } from "@/rpp/client/redaction";
import type { ExchangeLog, ExchangeRecord } from "@/rpp/client/diagnostics";
import { formFromRequest, FROM_EXCHANGE_PARAM } from "@/application/developer/rawRequest";
import { filterExchanges, formatBody, rawExchange, rawRequest, rawResponse, summarize } from "./exchangeView";

const NONE: readonly ExchangeRecord[] = [];
const noSubscription = () => () => {};

function useExchanges(log: ExchangeLog | undefined): readonly ExchangeRecord[] {
  return useSyncExternalStore(log ? log.subscribe : noSubscription, () => (log ? log.entries() : NONE));
}

const timeOf = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
};

const duration = (ms: number) => `${Math.round(ms)} ms`;

export function ExchangesPage() {
  const { session } = useConnection();
  const records = useExchanges(session?.exchanges);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();

  if (!session) {
    return (
      <>
        <PageHeader title={t("exchanges.page.title")} description={t("exchanges.page.descriptionDisconnected")} />
        <NotConnected />
      </>
    );
  }

  const visible = filterExchanges(records, query);
  const selected = visible.find((record) => record.id === selectedId) ?? visible[0];

  return (
    <>
      <PageHeader
        title={t("exchanges.page.title")}
        description={t("exchanges.page.description")}
        actions={
          <Button variant="secondary" size="sm" disabled={records.length === 0} onClick={() => session.exchanges.clear()}>
            <Trash2 aria-hidden />
            {t("exchanges.clear")}
          </Button>
        }
      />

      {records.length === 0 ? (
        <EmptyState title={t("exchanges.empty.title")}>
          {t("exchanges.empty.description")}
        </EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <Field label={t("exchanges.filter.label")} hint={t("exchanges.filter.hint")}>
              {(control) => (
                <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} {...control} />
              )}
            </Field>
            <p className="text-sm text-muted-foreground" role="status">
              {visible.length === records.length
                ? t("exchanges.count", { count: records.length })
                : t("exchanges.countFiltered", { count: records.length, visible: visible.length, total: records.length })}
            </p>
            <ul aria-label={t("exchanges.page.title")} className="divide-y divide-border border-y border-border">
              {visible.map((record) => (
                <li key={record.id}>
                  <ExchangeRow record={record} current={record.id === selected?.id} onSelect={() => setSelectedId(record.id)} />
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0">
            {selected ? (
              <ExchangeDetail record={selected} />
            ) : (
              <EmptyState title={t("exchanges.empty.noMatch")} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ExchangeRow({ record, current, onSelect }: { record: ExchangeRecord; current: boolean; onSelect: () => void }) {
  const summary = summarize(record);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={current ? "true" : undefined}
      className={cn("flex w-full flex-col gap-1 px-2 py-3 text-left hover:bg-muted/60", current && "bg-muted")}
    >
      <span className="flex items-center gap-2">
        <Badge tone={summary.tone} dot>
          {summary.outcome}
        </Badge>
        <span className="font-mono text-xs font-semibold">{summary.method}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {timeOf(record.startedAt)} · {duration(record.durationMs)}
        </span>
      </span>
      <code className="break-all text-xs">{summary.target}</code>
    </button>
  );
}

export function ExchangeDetail({ record }: { record: ExchangeRecord }) {
  const summary = summarize(record);
  const { request, outcome } = record;
  const response = outcome.kind === "response" ? outcome : undefined;
  const serverTransactionId = response?.headers["rpp-svtrid"];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{summary.method}</span>
          <code className="min-w-0 break-all text-base">{summary.target}</code>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={summary.tone} dot>
            {response ? `${response.status} ${response.statusText}`.trim() : summary.outcome}
          </Badge>
          {summary.resultCode !== undefined && <ResultCodeChip code={summary.resultCode} />}
        </div>
        <dl className="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-1 text-sm">
          <Term name={t("exchanges.detail.started")}>{new Date(record.startedAt).toString()}</Term>
          <Term name={t("exchanges.detail.duration")}>{duration(record.durationMs)}</Term>
          <Term name={t("exchanges.detail.address")}>
            <code className="break-all">{request.url}</code>
          </Term>
          <Term name="RPP-Cltrid">
            <code>{request.headers["rpp-cltrid"] ?? t("exchanges.detail.none")}</code>
          </Term>
          {response && (
            <Term name="RPP-Svtrid">
              <code>{serverTransactionId ?? t("exchanges.detail.none")}</code>
            </Term>
          )}
          <Term name={t("exchanges.detail.exchange")}>
            <code>{record.id}</code>
          </Term>
        </dl>
        <CopyActions key={record.id} record={record} />
      </div>

      <Section id="request" title={t("exchanges.detail.request")}>
        <HeadersTable label={t("exchanges.detail.requestHeaders")} headers={request.headers} />
        <Body label={t("exchanges.detail.requestBody")} text={request.body} emptyText={t("exchanges.detail.requestBodyEmpty")} />
      </Section>

      <Section id="response" title={t("exchanges.detail.response")}>
        {outcome.kind === "error" ? (
          <Callout tone="danger" title={t("exchanges.detail.noResponse", { errorKind: outcome.errorKind })}>
            {outcome.message}
          </Callout>
        ) : (
          <>
            {outcome.redirected && (
              <Callout tone="warning" title={t("exchanges.detail.redirected")}>
                {t("exchanges.detail.redirectedPrefix")}<code className="break-all">{outcome.url}</code>{t("exchanges.detail.redirectedSuffix")}
              </Callout>
            )}
            <HeadersTable label={t("exchanges.detail.responseHeaders")} headers={outcome.headers} />
            <Body label={t("exchanges.detail.responseBody")} text={outcome.body} truncated={outcome.bodyTruncated} emptyText={t("exchanges.detail.responseBodyEmpty")} />
          </>
        )}
      </Section>
    </div>
  );
}

type CopyTarget = "request" | "response" | "both";
type CopyState = { kind: "idle" } | { kind: "copied"; target: CopyTarget } | { kind: "failed" };

const COPIED_FOR_MS = 2000;

/** Copies the recorded (already redacted) exchange as raw text; nothing is re-read from the live request. */
function CopyActions({ record }: { record: ExchangeRecord }) {
  const { session } = useConnection();
  const canOpen = session !== undefined && formFromRequest(record.request, session.profile.baseUrl) !== undefined;
  const [state, setState] = useState<CopyState>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (target: CopyTarget) => {
    const text = target === "request" ? rawRequest(record) : target === "response" ? rawResponse(record) : rawExchange(record);
    clearTimeout(timer.current);
    try {
      // Unavailable outside a secure context, and the browser may refuse permission.
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setState({ kind: "copied", target });
      timer.current = setTimeout(() => setState({ kind: "idle" }), COPIED_FOR_MS);
    } catch {
      setState({ kind: "failed" });
    }
  };

  const button = (target: CopyTarget, label: string) => {
    const copied = state.kind === "copied" && state.target === target;
    return (
      <Button variant="secondary" size="sm" onClick={() => void copy(target)}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {label}
      </Button>
    );
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <div role="group" aria-label={t("exchanges.copy.group")} className="flex flex-wrap gap-2">
          {button("request", t("exchanges.copy.request"))}
          {button("response", t("exchanges.copy.response"))}
          {button("both", t("exchanges.copy.both"))}
        </div>
        {canOpen && (
          <Link
            to={`/developer/requests?${FROM_EXCHANGE_PARAM}=${encodeURIComponent(record.id)}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <Terminal aria-hidden />
            {t("exchanges.openRawRequest")}
          </Link>
        )}
      </div>
      <p aria-live="polite" className={cn("text-sm", state.kind === "failed" ? "text-destructive" : "text-muted-foreground")}>
        {state.kind === "copied" ? t("exchanges.copy.copied") : state.kind === "failed" ? t("exchanges.copy.failed") : t("exchanges.copy.hint")}
      </p>
    </div>
  );
}

function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{name}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function HeadersTable({ label, headers }: { label: string; headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{t("exchanges.detail.noHeaders")}</p>;
  return (
    <table className="w-full table-fixed border-y border-border text-sm">
      <caption className="sr-only">{label}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{t("exchanges.detail.name")}</th>
          <th scope="col">{t("exchanges.detail.value")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {entries.map(([name, value]) => (
          <tr key={name} className="align-top">
            <th scope="row" className="w-2/5 py-1.5 pr-4 text-left font-mono text-xs font-medium break-all">
              {name}
            </th>
            <td className="py-1.5 font-mono text-xs break-all">
              {value === REDACTED ? <span className="italic text-muted-foreground">{value}</span> : value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Body({ label, text, truncated = false, emptyText }: { label: string; text: string | undefined; truncated?: boolean; emptyText: string }) {
  if (text === undefined) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  const body = formatBody(text);
  return (
    <div className="flex flex-col gap-2">
      {truncated && (
        <Callout tone="warning" title={t("exchanges.detail.bodyTruncated")}>
          {t("exchanges.detail.bodyTruncatedDescription")}
        </Callout>
      )}
      <pre
        tabIndex={0}
        aria-label={body.formatted ? t("exchanges.detail.formattedBody", { label }) : label}
        className="max-h-[28rem] overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs"
      >
        {body.text}
      </pre>
    </div>
  );
}
