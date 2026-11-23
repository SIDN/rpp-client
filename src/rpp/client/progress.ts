/** What a request has reached. A browser reports no finer steps: the time between `sent` and `headers` is the server's. */
export type ProgressEvent =
  | { id: string; phase: "started"; method: string; at: number }
  | { id: string; phase: "sent"; url: string; clientTransactionId: string; at: number }
  | { id: string; phase: "headers"; status: number; at: number }
  | { id: string; phase: "read"; at: number }
  | { id: string; phase: "finished"; outcome: "response" | "error"; at: number };

export type ProgressListener = (event: ProgressEvent) => void;

export type ActivityStage = "preparing" | "waiting" | "reading" | "finished";

/** One request as far as it has come. Times are `performance.now()` marks in milliseconds. */
export interface RequestActivity {
  /** Equals the id of the exchange record the request ends in. */
  id: string;
  /** Rises with every request; a screen remembers it to show the requests of one action. */
  seq: number;
  method: string;
  /** Redacted; set once the request is sent. */
  url: string | undefined;
  clientTransactionId: string | undefined;
  status: number | undefined;
  stage: ActivityStage;
  /** Finished without a response. */
  failed: boolean;
  startedAt: number;
  sentAt: number | undefined;
  headersAt: number | undefined;
  readAt: number | undefined;
  finishedAt: number | undefined;
}

/** In-memory, bounded record of recent requests, from start to finish; shaped for `useSyncExternalStore`. */
export interface ActivityLog {
  readonly record: ProgressListener;
  entries(): readonly RequestActivity[];
  /** The `seq` of the latest request, 0 before the first. */
  sequence(): number;
  subscribe(listener: () => void): () => void;
  clear(): void;
}

export function createActivityLog(capacity = 50): ActivityLog {
  let entries: readonly RequestActivity[] = [];
  let sequence = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const update = (id: string, change: (entry: RequestActivity) => RequestActivity) => {
    if (!entries.some((entry) => entry.id === id)) return;
    entries = entries.map((entry) => (entry.id === id ? change(entry) : entry));
    notify();
  };

  return {
    record(event) {
      switch (event.phase) {
        case "started":
          entries = [
            ...entries,
            {
              id: event.id,
              seq: ++sequence,
              method: event.method,
              url: undefined,
              clientTransactionId: undefined,
              status: undefined,
              stage: "preparing" as const,
              failed: false,
              startedAt: event.at,
              sentAt: undefined,
              headersAt: undefined,
              readAt: undefined,
              finishedAt: undefined,
            },
          ].slice(-capacity);
          notify();
          return;
        case "sent":
          return update(event.id, (entry) => ({
            ...entry,
            url: event.url,
            clientTransactionId: event.clientTransactionId,
            stage: "waiting",
            sentAt: event.at,
          }));
        case "headers":
          return update(event.id, (entry) => ({ ...entry, status: event.status, stage: "reading", headersAt: event.at }));
        case "read":
          return update(event.id, (entry) => ({ ...entry, readAt: event.at }));
        case "finished":
          return update(event.id, (entry) => ({
            ...entry,
            stage: "finished",
            failed: event.outcome === "error",
            finishedAt: event.at,
          }));
      }
    },
    entries: () => entries,
    sequence: () => sequence,
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
