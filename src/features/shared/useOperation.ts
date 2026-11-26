import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useConnection } from "@/app/connection-context";
import { createDraftStore, draftKey, useDraftStore } from "@/app/draft-context";
import type { RequestActivity } from "@/rpp/client/progress";
import { isAbort, toFailure, type RppFailure } from "@/rpp/errors/RppError";
import type { OperationSuccess } from "@/rpp/operations/types";

const NONE: readonly RequestActivity[] = [];
const noSubscription = () => () => {};

export interface Operation<Variables, Data> {
  /** Sends the request. Does nothing while one is under way. */
  start(variables: Variables): void;
  /** Stops waiting for the answer; the registry may still have acted on the request. */
  cancel(): void;
  reset(): void;
  pending: boolean;
  /** What was last started with, also while it is under way. */
  variables: Variables | undefined;
  result: OperationSuccess<Data> | undefined;
  /** A failure to show; a cancelled request is `cancelled` instead. */
  failure: RppFailure | undefined;
  cancelled: boolean;
  /** The latest request this operation has made since it was started, from its first stage to the answer; earlier ones are not kept. */
  activity: RequestActivity | undefined;
}

/** One start of an operation, from the request to its outcome. */
type Run<Variables, Data> = {
  /** The sequence number the session's activity log had when it started. */
  mark: number;
  variables: Variables;
  controller: AbortController;
} & ({ status: "pending" } | { status: "success"; result: OperationSuccess<Data> } | { status: "error"; error: unknown });

export interface OperationOptions {
  /**
   * The draft key to keep the last run under, so that the outcome (or the request still under way) is shown again when
   * the screen is left and come back to. It is kept in memory for the connection only, like the forms. Without it, the
   * outcome lasts as long as the component.
   */
  keep?: string;
}

/**
 * One on-demand protocol operation of the active session, with the progress of its requests. The requests are told
 * from those of other actions by the sequence number the session had when this one started. An answer that arrives
 * after the screen was left still runs `onSuccess` and, when kept, is shown on return.
 */
export function useOperation<Variables, Data>(
  action: (variables: Variables, signal: AbortSignal) => Promise<OperationSuccess<Data>>,
  onSuccess?: (result: OperationSuccess<Data>, variables: Variables) => void,
  options: OperationOptions = {},
): Operation<Variables, Data> {
  const { session } = useConnection();
  const log = session?.activity;
  const drafts = useDraftStore();
  const [local] = useState(createDraftStore);
  const store = options.keep ? drafts : local;
  const key = draftKey(session?.id, options.keep ?? "operation");

  const subscribeRun = useCallback((listener: () => void) => store.subscribe(key, listener), [store, key]);
  const run = useSyncExternalStore(subscribeRun, () => store.get(key) as Run<Variables, Data> | undefined);
  const entries = useSyncExternalStore(log ? log.subscribe : noSubscription, () => (log ? log.entries() : NONE));

  // The latest callbacks, also for an answer that arrives after the component is gone.
  const latest = useRef({ action, onSuccess });
  useEffect(() => {
    latest.current = { action, onSuccess };
  });

  const failure = run?.status === "error" ? toFailure(run.error) : undefined;
  const cancelled = failure !== undefined && isAbort(failure);

  return {
    start(variables) {
      const current = store.get(key) as Run<Variables, Data> | undefined;
      if (current?.status === "pending" || !log) return;
      const started: Run<Variables, Data> = { mark: log.sequence(), variables, controller: new AbortController(), status: "pending" };
      store.set(key, started);
      // Only the run still shown takes the outcome: a reset or a newer start replaces it.
      const settle = (outcome: Run<Variables, Data>) => {
        if (store.get(key) === started) store.set(key, outcome);
      };
      Promise.resolve()
        .then(() => latest.current.action(variables, started.controller.signal))
        .then((result) => {
          latest.current.onSuccess?.(result, variables);
          return result;
        })
        .then(
          (result) => settle({ ...started, status: "success", result }),
          (error: unknown) => settle({ ...started, status: "error", error }),
        );
    },
    cancel: () => run?.controller.abort(),
    reset() {
      store.set(key, undefined);
    },
    pending: run?.status === "pending",
    variables: run?.variables,
    result: run?.status === "success" ? run.result : undefined,
    failure: cancelled ? undefined : failure,
    cancelled,
    activity: run === undefined ? undefined : entries.findLast((entry) => entry.seq > run.mark),
  };
}
