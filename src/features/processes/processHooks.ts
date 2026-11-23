import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import { useConnection } from "@/app/connection-context";
import {
  canReadProcess,
  readProcess,
  refKey,
  type ObjectType,
  type ProcessDetail,
  type ProcessRef,
  type SeenObject,
} from "@/application/processes/processList";
import { isJsonObject } from "@/rpp/core/types/json";
import { toFailure } from "@/rpp/errors/RppError";
import { SEEN_ROOT } from "../shared/seenObjects";

const TYPE_OF_ROOT = new Map<unknown, ObjectType>(Object.entries(SEEN_ROOT).map(([type, root]) => [root, type as ObjectType]));

/** The most statuses read at once: each is a request. */
export const MAX_READS = 100;

/** The domain names, contacts and hosts the screens have shown in this session, as the query cache keeps them. */
export function useSeenObjects(): SeenObject[] {
  const { session } = useConnection();
  const cache = useQueryClient().getQueryCache();
  const sessionId = session?.id;

  const signature = useSyncExternalStore(
    (listener) => cache.subscribe(listener),
    () =>
      sessionId === undefined
        ? ""
        : cache
            .findAll({ predicate: (query) => query.queryKey[1] === sessionId && TYPE_OF_ROOT.has(query.queryKey[0]) && query.state.data !== undefined })
            .map((query) => `${query.queryHash}@${query.state.dataUpdatedAt}`)
            .join("|"),
  );

  return useMemo(() => {
    if (sessionId === undefined || signature === "") return [];
    const seen = new Map<string, SeenObject>();
    for (const query of cache.findAll({ predicate: (entry) => entry.queryKey[1] === sessionId && TYPE_OF_ROOT.has(entry.queryKey[0]) && entry.state.data !== undefined })) {
      const type = TYPE_OF_ROOT.get(query.queryKey[0]);
      if (!type) continue;
      const id = String(query.queryKey[2]);
      const key = `${type}\n${type === "contact" ? id : id.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, { type, id, processes: isJsonObject(query.state.data) ? query.state.data.processes : undefined });
    }
    return [...seen.values()];
  }, [cache, sessionId, signature]);
}

/** Where the details of each process stand. Only the processes the contract can read are asked for, and at most `MAX_READS`. */
export function useProcessDetails(refs: readonly ProcessRef[]): { details: ReadonlyMap<string, ProcessDetail>; unread: number } {
  const { session } = useConnection();
  const client = session?.client;
  const readable = useMemo(() => (client ? refs.filter((ref) => canReadProcess(client, ref)) : []), [client, refs]);
  const asked = readable.slice(0, MAX_READS);

  const results = useQueries({
    queries: asked.map((ref) => ({
      queryKey: ["process", session?.id, ref.objectType, ref.objectId, ref.kind, ref.processId] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => ({ process: client ? await readProcess(client, ref, signal) : undefined }),
      staleTime: 30_000,
      enabled: client !== undefined,
    })),
  });

  const details = new Map<string, ProcessDetail>();
  for (const ref of refs) details.set(refKey(ref), { state: "unreadable" });
  asked.forEach((ref, index) => {
    const result = results[index];
    details.set(
      refKey(ref),
      result?.isError ? { state: "failed", message: toFailure(result.error).message } : result?.data ? { state: "ready", process: result.data.process } : { state: "loading" },
    );
  });
  for (const ref of readable.slice(MAX_READS)) details.set(refKey(ref), { state: "unreadable" });
  return { details, unread: Math.max(0, readable.length - MAX_READS) };
}
