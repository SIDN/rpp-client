import type { TransportErrorKind } from "../errors/TransportError";

/** What was sent, after redaction. */
export interface RequestSnapshot {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export type ExchangeOutcome =
  | {
      kind: "response";
      status: number;
      statusText: string;
      url: string;
      redirected: boolean;
      headers: Record<string, string>;
      body: string | undefined;
      bodyTruncated: boolean;
    }
  | { kind: "error"; errorKind: TransportErrorKind; message: string };

/** One request/response exchange. Redaction has been applied before a record is created. */
export interface ExchangeRecord {
  id: string;
  startedAt: string;
  durationMs: number;
  request: RequestSnapshot;
  outcome: ExchangeOutcome;
}

export type ExchangeListener = (record: ExchangeRecord) => void;

/** In-memory, bounded log of redacted exchanges; shaped for `useSyncExternalStore`. */
export interface ExchangeLog {
  readonly record: ExchangeListener;
  entries(): readonly ExchangeRecord[];
  subscribe(listener: () => void): () => void;
  clear(): void;
}

export function createExchangeLog(capacity = 200): ExchangeLog {
  let entries: readonly ExchangeRecord[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    record(record) {
      entries = [...entries, record].slice(-capacity);
      notify();
    },
    entries: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear() {
      entries = [];
      notify();
    },
  };
}
