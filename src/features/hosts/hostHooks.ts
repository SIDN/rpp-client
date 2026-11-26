import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { t } from "@/i18n";
import { useConnection } from "@/app/connection-context";
import { createHostWorkflows, tryParseHostName, type HostWorkflows } from "@/application/hosts/hostWorkflows";
import type { Host } from "@/rpp/core/types/objects";
import { useDraftState } from "../shared/drafts";
import { seenKey } from "../shared/seenObjects";

/** Hosts the server has shown in this session, by A-label; nothing in the key but the connection number and the name. */
const hostKey = (sessionId: number | undefined, name: string) => seenKey("host", sessionId, name);

/** The workflows over the protocol client of the active session; the screens that use it only exist while connected. */
export function useHostWorkflows(): HostWorkflows {
  const { session } = useConnection();
  return useMemo(() => {
    if (!session) throw new Error(t("hosts.errors.connectionRequired"));
    return createHostWorkflows(session.client);
  }, [session]);
}

/** The last host read or returned for this name in this session, or undefined. It is never fetched from here. */
export function useCachedHost(input: string): Host | undefined {
  const { session } = useConnection();
  const ref = tryParseHostName(input);
  const query = useQuery<Host>({ queryKey: hostKey(session?.id, ref?.name ?? ""), queryFn: skipToken, staleTime: Infinity });
  return ref ? query.data : undefined;
}

/** Keeps what the server showed of a host for the other workflows, and drops it when an action makes it stale. */
export function useHostStore() {
  const { session } = useConnection();
  const queryClient = useQueryClient();
  return {
    remember(input: string, host: Host) {
      const ref = tryParseHostName(input);
      if (ref) queryClient.setQueryData(hostKey(session?.id, ref.name), host);
    },
    forget(input: string) {
      const ref = tryParseHostName(input);
      if (ref) void queryClient.resetQueries({ queryKey: hostKey(session?.id, ref.name), exact: true });
    },
  };
}

/** The host last loaded in Info or Change, as long as it is known, and how to record one: a new host can be filled in from it. */
export function useLoadedHost(): { host: Host | undefined; setLoaded(name: string): void } {
  const [name, setLoaded] = useDraftState("hosts/loaded", "");
  return { host: useCachedHost(name), setLoaded };
}
