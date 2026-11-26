import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useConnection } from "@/app/connection-context";
import { t } from "@/i18n";
import {
  createRequestContactWorkflows,
  parseRequestContactId,
  type RequestContactWorkflows,
} from "@/application/extensions/denicRri/requestContactWorkflows";
import type { RequestContact } from "@/rpp/extensions/modules/denicRri";

const key = (sessionId: number | undefined, id: string) => ["requestContact", sessionId, id] as const;

const trimmed = (input: string): string | undefined => {
  try {
    return parseRequestContactId(input);
  } catch {
    return undefined;
  }
};

/** The workflows over the protocol client of the active session; the screen that uses it only exists while connected. */
export function useRequestContactWorkflows(): RequestContactWorkflows {
  const { session } = useConnection();
  return useMemo(() => {
    if (!session) throw new Error(t("requestContacts.errors.connectionRequired"));
    return createRequestContactWorkflows(session.client);
  }, [session]);
}

/** The last request contact read or returned for this handle in this session. It is never fetched from here. */
export function useCachedRequestContact(input: string): RequestContact | undefined {
  const { session } = useConnection();
  const id = trimmed(input);
  const query = useQuery<RequestContact>({ queryKey: key(session?.id, id ?? ""), queryFn: skipToken, staleTime: Infinity });
  return id ? query.data : undefined;
}

export function useRequestContactStore() {
  const { session } = useConnection();
  const queryClient = useQueryClient();
  return {
    remember(input: string, contact: RequestContact) {
      const id = trimmed(input);
      if (id) queryClient.setQueryData(key(session?.id, id), contact);
    },
    forget(input: string) {
      const id = trimmed(input);
      if (id) void queryClient.resetQueries({ queryKey: key(session?.id, id), exact: true });
    },
  };
}
