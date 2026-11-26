import { createContext, useContext } from "react";

/**
 * What the screens hold of work in progress (form values, the tab and identifier chosen, the object last loaded) so
 * that leaving a screen and coming back finds it as it was. It lives in memory only and belongs to one connection:
 * keys start with the connection number, and `retain` drops those of every other connection, typed passwords with them.
 */
export interface DraftStore {
  get(key: string): unknown;
  has(key: string): boolean;
  /** Stores the value and tells those subscribed to the key. */
  set(key: string, value: unknown): void;
  /** Stores the value without telling anyone, for a first value given while rendering. */
  seed(key: string, value: unknown): void;
  subscribe(key: string, listener: () => void): () => void;
  /** Drops every key not of this connection. */
  retain(sessionId: number | undefined): void;
}

export const draftKey = (sessionId: number | undefined, key: string) => `${sessionId ?? "-"}:${key}`;

export function createDraftStore(): DraftStore {
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<() => void>>();
  const notify = (key: string) => listeners.get(key)?.forEach((listener) => listener());
  return {
    get: (key) => values.get(key),
    has: (key) => values.has(key),
    set(key, value) {
      values.set(key, value);
      notify(key);
    },
    seed(key, value) {
      values.set(key, value);
    },
    subscribe(key, listener) {
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => set.delete(listener);
    },
    retain(sessionId) {
      const prefix = draftKey(sessionId, "");
      for (const key of [...values.keys()]) {
        if (!key.startsWith(prefix)) {
          values.delete(key);
          notify(key);
        }
      }
    },
  };
}

export const DraftContext = createContext<DraftStore | undefined>(undefined);

export function useDraftStore(): DraftStore {
  const store = useContext(DraftContext);
  if (!store) throw new Error("useDraftStore needs the app Providers");
  return store;
}
