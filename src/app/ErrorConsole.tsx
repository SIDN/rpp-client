import { ChevronUp, Terminal, Trash2, X } from "lucide-react";
import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { ResultCodeChip } from "@/components/protocol/protocol-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBody, targetOf } from "@/features/exchanges/exchangeView";
import type { ErrorEntry, ErrorLog } from "@/rpp/errors/errorLog";
import { useConnection } from "./connection-context";

const NONE: readonly ErrorEntry[] = [];
const noSubscription = () => () => {};

const timeOf = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
};

function Body({ label, text, truncated = false }: { label: string; text: string | undefined; truncated?: boolean }) {
  if (text === undefined) return null;
  const body = formatBody(text);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-sidebar-muted">
        {label}
        {truncated && " (cut off)"}
      </p>
      <pre tabIndex={0} aria-label={label} className="max-h-48 overflow-auto rounded-sm border border-sidebar-border bg-black/20 p-2 font-mono text-xs">
        {body.text}
      </pre>
    </div>
  );
}

function ErrorRow({ entry }: { entry: ErrorEntry }) {
  const { problem } = entry;
  return (
    <details className="group border-b border-sidebar-border">
      <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2 hover:bg-sidebar-active sm:grid-cols-[6rem_6rem_minmax(0,1fr)_auto]">
        <span className="font-mono text-xs text-sidebar-muted">{timeOf(entry.at)}</span>
        <span>
          <Badge tone="danger" dot>
            {entry.status === undefined ? "No response" : entry.status}
          </Badge>
        </span>
        <span className="col-span-2 min-w-0 sm:col-span-1">
          <span className="block truncate">
            <code className="font-semibold">{entry.method}</code> <code className="text-sidebar-muted">{targetOf(entry.url)}</code>
          </span>
          <span className="block truncate text-sm">{entry.summary}</span>
        </span>
        <span className="hidden sm:block">{entry.resultCode && <ResultCodeChip code={entry.resultCode.raw} />}</span>
      </summary>

      <div className="flex flex-col gap-3 px-4 pt-1 pb-4 text-sm sm:pl-[calc(6rem+1.75rem)]">
        {problem?.detail && <p>{problem.detail}</p>}
        {problem && problem.errors.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {problem.errors.map((error, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2">
                <ResultCodeChip code={error.result.raw} />
                <span>{error.reason || error.result.description}</span>
                {error.paths.map((path) => (
                  <code key={path} className="text-xs text-sidebar-muted">
                    {path}
                  </code>
                ))}
              </li>
            ))}
          </ul>
        )}
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-xs">
          <dt className="text-sidebar-muted">Address</dt>
          <dd>
            <code className="break-all">{entry.url}</code>
          </dd>
          {entry.clientTransactionId && (
            <>
              <dt className="text-sidebar-muted">RPP-Cltrid</dt>
              <dd>
                <code>{entry.clientTransactionId}</code>
              </dd>
            </>
          )}
          {entry.serverTransactionId && (
            <>
              <dt className="text-sidebar-muted">RPP-Svtrid</dt>
              <dd>
                <code>{entry.serverTransactionId}</code>
              </dd>
            </>
          )}
          <dt className="text-sidebar-muted">Exchange</dt>
          <dd>
            <code>{entry.exchangeId}</code> after {Math.round(entry.durationMs)} ms
          </dd>
        </dl>
        <Body label="Request body" text={entry.requestBody} />
        <Body label="Response body" text={entry.responseBody} truncated={entry.responseBodyTruncated} />
      </div>
    </details>
  );
}

function Console({ log }: { log: ErrorLog | undefined }) {
  const entries = useSyncExternalStore(log ? log.subscribe : noSubscription, () => (log ? log.entries() : NONE));
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const lastSeq = entries.at(-1)?.seq ?? 0;
  const unread = open ? 0 : entries.filter((entry) => entry.seq > seen).length;
  const latest = entries.at(-1);

  const flip = () => {
    setOpen(!open);
    setSeen(lastSeq);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    setOpen(false);
    setSeen(lastSeq);
    toggle.current?.focus();
  };

  return (
    <>
      {/* The console is fixed over the page, so the page gets its height as room to scroll the last of a screen above it. */}
      <div
        aria-hidden
        data-console-spacer={open ? "open" : "closed"}
        className={cn("transition-[height] duration-300 ease-out lg:col-span-2", open ? "h-[calc(40dvh+2.25rem+1px)]" : "h-0")}
      />
      <section
        aria-label="Error console"
        onKeyDown={onKeyDown}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.5)] lg:left-[var(--sidebar-width,18rem)]"
      >
        <button
          ref={toggle}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Error console, ${entries.length} ${entries.length === 1 ? "error" : "errors"}${unread > 0 ? `, ${unread} new` : ""}`}
          onClick={flip}
          className="flex h-9 w-full items-center gap-3 px-4 text-left text-sm hover:bg-sidebar-active"
        >
          <Terminal aria-hidden className="size-4 shrink-0" />
          <span className="font-medium">Errors</span>
          <Badge tone={unread > 0 ? "danger" : "neutral"} className={unread > 0 ? undefined : "bg-sidebar-active text-sidebar-foreground"}>
            {unread > 0 ? `${unread} new` : entries.length}
          </Badge>
          {!open && latest && <span className="min-w-0 flex-1 truncate text-sidebar-muted">{latest.summary}</span>}
          <ChevronUp aria-hidden className={cn("ml-auto size-4 shrink-0 transition-transform duration-300", open && "rotate-180")} />
        </button>

        <div id={panelId} inert={!open} className={cn("overflow-hidden transition-[height] duration-300 ease-out", open ? "h-[40dvh]" : "h-0")}>
          <div className="flex h-[40dvh] flex-col">
            <div className="flex items-center gap-2 border-y border-sidebar-border px-4 py-1.5">
              <h2 className="text-sm font-semibold">Errors received, newest first</h2>
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" disabled={entries.length === 0} onClick={() => log?.clear()} className="text-sidebar-foreground hover:bg-sidebar-active">
                  <Trash2 aria-hidden />
                  Clear
                </Button>
                <Button variant="ghost" size="sm" aria-label="Close the error console" onClick={flip} className="text-sidebar-foreground hover:bg-sidebar-active">
                  <X aria-hidden />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {entries.length === 0 ? (
                <p className="px-4 py-6 text-sidebar-muted">No errors yet. Errors the registry returns, and requests that get no answer, are listed here.</p>
              ) : (
                [...entries].reverse().map((entry) => <ErrorRow key={entry.seq} entry={entry} />)
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/** A console at the bottom of the screen that slides up to the history of the errors of this connection. */
export function ErrorConsole() {
  const { session } = useConnection();
  // A new connection starts a new history.
  return <Console key={session?.id ?? 0} log={session?.errors} />;
}
