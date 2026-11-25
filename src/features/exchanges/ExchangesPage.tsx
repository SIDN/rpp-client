import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { useConnection } from "@/app/connection-context";
import { EmptyState, PageHeader, Section } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { ResultCodeChip } from "@/components/protocol/protocol-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { REDACTED } from "@/rpp/client/redaction";
import type { ExchangeLog, ExchangeRecord } from "@/rpp/client/diagnostics";
import { filterExchanges, formatBody, summarize } from "./exchangeView";

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
        <PageHeader title="Exchanges" description="Every request and response of this session, with secrets removed." />
        <NotConnected />
      </>
    );
  }

  const visible = filterExchanges(records, query);
  const selected = visible.find((record) => record.id === selectedId) ?? visible[0];

  return (
    <>
      <PageHeader
        title="Exchanges"
        description="Every request and response of this session, newest first. Credentials and secret values are replaced before they are recorded."
        actions={
          <Button variant="secondary" size="sm" disabled={records.length === 0} onClick={() => session.exchanges.clear()}>
            <Trash2 aria-hidden />
            Clear
          </Button>
        }
      />

      {records.length === 0 ? (
        <EmptyState title="Nothing has been sent yet">
          The discovery request that read the capabilities is recorded as soon as it has been made. Use the registry screens to see more.
        </EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <Field label="Filter" hint="Method, path, status, result code or transaction id.">
              {(control) => (
                <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} {...control} />
              )}
            </Field>
            <p className="text-sm text-muted-foreground" role="status">
              {visible.length === records.length ? `${records.length} exchange(s)` : `${visible.length} of ${records.length} exchange(s)`}
            </p>
            <ul aria-label="Exchanges" className="divide-y divide-border border-y border-border">
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
              <EmptyState title="No exchange matches the filter" />
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
          <Term name="Started">{new Date(record.startedAt).toString()}</Term>
          <Term name="Duration">{duration(record.durationMs)}</Term>
          <Term name="Address">
            <code className="break-all">{request.url}</code>
          </Term>
          <Term name="RPP-Cltrid">
            <code>{request.headers["rpp-cltrid"] ?? "none"}</code>
          </Term>
          {response && (
            <Term name="RPP-Svtrid">
              <code>{serverTransactionId ?? "none"}</code>
            </Term>
          )}
          <Term name="Exchange">
            <code>{record.id}</code>
          </Term>
        </dl>
      </div>

      <Section id="request" title="Request">
        <HeadersTable label="Request headers" headers={request.headers} />
        <Body label="Request body" text={request.body} emptyText="The request has no body." />
      </Section>

      <Section id="response" title="Response">
        {outcome.kind === "error" ? (
          <Callout tone="danger" title={`No response: ${outcome.errorKind}`}>
            {outcome.message}
          </Callout>
        ) : (
          <>
            {outcome.redirected && (
              <Callout tone="warning" title="The request was redirected">
                The answer came from <code className="break-all">{outcome.url}</code>.
              </Callout>
            )}
            <HeadersTable label="Response headers" headers={outcome.headers} />
            <Body label="Response body" text={outcome.body} truncated={outcome.bodyTruncated} emptyText="The response has no body." />
          </>
        )}
      </Section>
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
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No headers.</p>;
  return (
    <table className="w-full table-fixed border-y border-border text-sm">
      <caption className="sr-only">{label}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Value</th>
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
        <Callout tone="warning" title="The body is cut off">
          Only the first part of the body was kept for this view.
        </Callout>
      )}
      <pre
        tabIndex={0}
        aria-label={body.formatted ? `${label}, formatted` : label}
        className="max-h-[28rem] overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs"
      >
        {body.text}
      </pre>
    </div>
  );
}
