import { t } from "@/i18n";
import { useMemo } from "react";
import { useConnection } from "@/app/connection-context";
import { createDomainWorkflows, type DomainWorkflows } from "@/application/domains/domainWorkflows";

/** The workflows over the protocol client of the active session; the screens that use it only exist while connected. */
export function useDomainWorkflows(): DomainWorkflows {
  const { session } = useConnection();
  return useMemo(() => {
    if (!session) throw new Error(t("domains.errors.connectionRequired"));
    return createDomainWorkflows(session.client);
  }, [session]);
}
