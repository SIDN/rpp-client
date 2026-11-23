import type { ExchangeRecord } from "./diagnostics";
import { queueSizeOf } from "./links";

/** The last queue size the server reported; undefined until a response has carried one. */
export interface QueueSnapshot {
  size: number | undefined;
  /** When the request that reported it started, ISO 8601, client clock. */
  at: string | undefined;
}

/** The size of the message queue as the latest response that carried `RPP-Queue-Size` said; shaped for `useSyncExternalStore`. */
export interface QueueMonitor {
  readonly record: (record: ExchangeRecord) => void;
  get(): QueueSnapshot;
  subscribe(listener: () => void): () => void;
}

export function createQueueMonitor(): QueueMonitor {
  let snapshot: QueueSnapshot = { size: undefined, at: undefined };
  const listeners = new Set<() => void>();

  return {
    record(record) {
      // A request that got no answer says nothing, nor does a response without the header or with a value that is not a count.
      if (record.outcome.kind !== "response") return;
      const { size } = queueSizeOf(new Headers(record.outcome.headers));
      if (size === undefined) return;
      snapshot = { size, at: record.startedAt };
      listeners.forEach((listener) => listener());
    },
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
