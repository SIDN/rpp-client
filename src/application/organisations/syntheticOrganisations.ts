import { t } from "@/i18n";
import type { Organisation } from "@/rpp/core/types/objects";
import { invalidRequest } from "@/rpp/operations/paths";
import { distinctNumbers } from "../search/synthesize";
import { cardOf } from "./card";
import { createBody, type CreateOrganisationInput } from "./organisationData";

const COMPANIES = ["Noordzee Hosting", "Polder Domeinen", "Grachtweb", "Duinhost", "Kade Digitaal", "Molenaar Privacy"] as const;
/** Role types from the IANA registry the draft points to; never `registrar`, which is the parent's. */
const ROLES = [["reseller"], ["reseller"], ["reseller", "dns-operator"], ["dns-operator"], ["reseller"], ["privacyproxy"]] as const;
/** A mix of what a server and a client set, so that several statuses show up. */
const STATUSES = [["ok"], ["linked"], ["clientUpdateProhibited", "clientDeleteProhibited"], ["ok"], ["hold"], ["pendingCreate"]] as const;
/** How many users each made-up organisation lists, so that deleting one with users can be tried. */
const USERS = [2, 0, 1, 0, 3, 0] as const;

export const SYNTHETIC_CHILD_COUNT = COMPANIES.length;

const organisationRef = (id: string) => ({ "@type": "organisation" as const, id });
const domainOf = (company: string) => company.toLowerCase().replace(/\s+/g, "-") + ".example";

/**
 * The child organisations of `parentId`, made up by this client: identifiers with random numbers (`org-4821`), a role
 * other than registrar, a Card, statuses, a contact and some users. Nothing names a registrar or its client identifiers.
 */
export function synthesizeChildren(parentId: string, options: { seed?: number } = {}): Organisation[] {
  const numbers = distinctNumbers(options.seed ?? 1, SYNTHETIC_CHILD_COUNT * 6);
  let next = SYNTHETIC_CHILD_COUNT;
  const take = () => numbers[next++] ?? next;
  return COMPANIES.map((company, index) => {
    const users = Array.from({ length: USERS[index] ?? 0 }, (_, user) => ({
      label: user === 0 ? "admin" : "tech",
      object: { "@type": "user", id: `user-${take()}` },
    }));
    return {
      "@type": "organisation",
      id: `org-${numbers[index]}`,
      status: (STATUSES[index] ?? ["ok"]).map((label) => ({ "@type": "organisationStatus", label })),
      roles: Object.fromEntries((ROLES[index] ?? ["reseller"]).map((name) => [name, { "@type": "organisationRole" }])),
      parent: organisationRef(parentId),
      contactInfo: cardOf({ name: company, email: `info@${domainOf(company)}`, voice: `+31.20${String(5550100 + index * 11).padStart(7, "0")}` }),
      contacts: [{ label: "admin", object: { "@type": "contact", id: `contact-${take()}` } }],
      ...(users.length > 0 && { users }),
    } as Organisation;
  });
}

/** A new made-up organisation, as the create form describes it. The registry would set the status; here it is `ok` unless chosen. */
export function createSyntheticOrganisation(input: CreateOrganisationInput, existing: readonly Organisation[]): Organisation {
  const body = createBody(input);
  if (existing.some((organisation) => organisation.id === body.id)) throw invalidRequest(t("organisations.validation.exists", { id: body.id }));
  return { ...body, status: body.status ?? [{ "@type": "organisationStatus", label: "ok" }] } as Organisation;
}
