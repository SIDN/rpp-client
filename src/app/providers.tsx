import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { KEPT_OBJECT_ROOTS } from "@/features/shared/seenObjects";
import { createDraftStore, DraftContext } from "./draft-context";

function createQueryClient(): QueryClient {
  // Protocol failures are shown to the user, so a failed query is not silently retried.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  // The ConnectionProvider drops them when the connection changes.
  for (const root of KEPT_OBJECT_ROOTS) client.setQueryDefaults([root], { gcTime: Infinity });
  return client;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  const [drafts] = useState(createDraftStore);
  return (
    <QueryClientProvider client={client}>
      <DraftContext.Provider value={drafts}>{children}</DraftContext.Provider>
    </QueryClientProvider>
  );
}
