import { useMutation } from "@tanstack/react-query";
import { useRef, useState, useSyncExternalStore } from "react";
import { useConnection } from "@/app/connection-context";
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

/**
 * One on-demand protocol operation of the active session, with the progress of its requests. The requests are told
 * from those of other actions by the sequence number the session had when this one started.
 */
export function useOperation<Variables, Data>(
  action: (variables: Variables, signal: AbortSignal) => Promise<OperationSuccess<Data>>,
  onSuccess?: (result: OperationSuccess<Data>, variables: Variables) => void,
): Operation<Variables, Data> {
  const { session } = useConnection();
  const log = session?.activity;
  const [mark, setMark] = useState<number>();
  const controller = useRef<AbortController>(undefined);
  const entries = useSyncExternalStore(log ? log.subscribe : noSubscription, () => (log ? log.entries() : NONE));

  const mutation = useMutation<OperationSuccess<Data>, unknown, Variables>({
    mutationFn: (variables) => {
      const abort = new AbortController();
      controller.current = abort;
      return action(variables, abort.signal);
    },
    onSuccess: (result, variables) => onSuccess?.(result, variables),
  });

  const failure = mutation.isError ? toFailure(mutation.error) : undefined;
  const cancelled = failure !== undefined && isAbort(failure);

  return {
    start(variables) {
      if (mutation.isPending || !log) return;
      setMark(log.sequence());
      mutation.mutate(variables);
    },
    cancel: () => controller.current?.abort(),
    reset() {
      setMark(undefined);
      mutation.reset();
    },
    pending: mutation.isPending,
    variables: mutation.variables,
    result: mutation.data,
    failure: cancelled ? undefined : failure,
    cancelled,
    activity: mark === undefined ? undefined : entries.findLast((entry) => entry.seq > mark),
  };
}
