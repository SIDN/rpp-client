import { useMemo } from "react";
import { useConnection } from "@/app/connection-context";
import { createDomainWorkflows, type DomainWorkflows } from "@/application/domains/domainWorkflows";

/** The workflows over the protocol client of the active session; the screens that use it only exist while connected. */
export function useDomainWorkflows(): DomainWorkflows {
  const { session } = useConnection();
  return useMemo(() => {
    if (!session) throw new Error("The domain workflows need a connection");
    return createDomainWorkflows(session.client);
  }, [session]);
}
