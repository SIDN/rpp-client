import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "@/app/connection-context";
import { tryParseDomainName } from "@/application/domains/domainWorkflows";
import type { DomainName } from "@/rpp/core/types/objects";
import { seenKey } from "../shared/seenObjects";

/** Domains the server has shown in this session, by A-label; nothing in the key but the connection number and the name. */
const domainKey = (sessionId: number | undefined, name: string) => seenKey("domainName", sessionId, name);

/** The last domain read or returned for this name in this session, or undefined. It is never fetched from here. */
export function useCachedDomain(input: string): DomainName | undefined {
  const { session } = useConnection();
  const ref = tryParseDomainName(input);
  const query = useQuery<DomainName>({ queryKey: domainKey(session?.id, ref?.name ?? ""), queryFn: skipToken, staleTime: Infinity });
  return ref ? query.data : undefined;
}

/** Keeps what the server showed of a domain for the other workflows, and drops it when an action makes it stale. */
export function useDomainStore() {
  const { session } = useConnection();
  const queryClient = useQueryClient();
  return {
    remember(input: string, domain: DomainName) {
      const ref = tryParseDomainName(input);
      if (ref) queryClient.setQueryData(domainKey(session?.id, ref.name), domain);
    },
    forget(input: string) {
      const ref = tryParseDomainName(input);
      if (ref) void queryClient.resetQueries({ queryKey: domainKey(session?.id, ref.name), exact: true });
    },
  };
}
