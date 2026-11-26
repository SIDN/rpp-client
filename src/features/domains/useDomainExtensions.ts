import { CONTACT_ROLES } from "@/application/domains/domainWorkflows";
import { DENIC_RRI, RRI_CONTACT_LABELS } from "@/rpp/extensions/modules/denicRri";
import { useExtensionActive } from "../extensions/useExtension";

/** What active extensions change in the domain workflows. Nothing changes until the server confirms an extension. */
export interface DomainExtensions {
  /** DENIC RRI: request contacts, holder labels, and the domain data in a transfer request. */
  rri: boolean;
  /** The labels the `contacts` of a domain may have. */
  contactRoles: readonly string[];
}

export function useDomainExtensions(): DomainExtensions {
  const rri = useExtensionActive(DENIC_RRI);
  return { rri, contactRoles: rri ? RRI_CONTACT_LABELS : CONTACT_ROLES };
}
