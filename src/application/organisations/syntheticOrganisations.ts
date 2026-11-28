import { t } from "@/i18n";
import type { Organisation } from "@/rpp/core/types/objects";
import { invalidRequest } from "@/rpp/operations/paths";
import { distinctNumbers } from "../search/synthesize";
import { cardOf } from "./card";
import { createBody, type CreateOrganisationInput } from "./organisationData";

/**
 * The made-up organisations below the root, each with the index of its parent in this list (`root` for the root itself),
 * so that the tree is several levels deep: registrar → Noordzee Hosting → Polder Domeinen → Grachtweb → Zeeland Sites.
 * Roles are from the IANA registry the draft points to; never `registrar`, which is the root's.
 */
const ORGANISATIONS: readonly { company: string; parent: number | "root"; roles: readonly string[]; statuses: readonly string[]; users: number }[] = [
  { company: "Noordzee Hosting", parent: "root", roles: ["reseller"], statuses: ["ok"], users: 2 },
  { company: "Polder Domeinen", parent: 0, roles: ["reseller"], statuses: ["linked"], users: 0 },
  { company: "Grachtweb", parent: 1, roles: ["reseller", "dns-operator"], statuses: ["clientUpdateProhibited", "clientDeleteProhibited"], users: 1 },
  { company: "Zeeland Sites", parent: 2, roles: ["reseller"], statuses: ["ok"], users: 0 },
  { company: "Dijkstra Webdiensten", parent: 0, roles: ["reseller"], statuses: ["ok"], users: 1 },
  { company: "Duinhost", parent: "root", roles: ["dns-operator"], statuses: ["ok"], users: 0 },
  { company: "Kade Digitaal", parent: "root", roles: ["reseller"], statuses: ["hold"], users: 3 },
  { company: "Molenaar Privacy", parent: 6, roles: ["privacyproxy"], statuses: ["pendingCreate"], users: 0 },
];

export const SYNTHETIC_ORGANISATION_COUNT = ORGANISATIONS.length;

const organisationRef = (id: string) => ({ "@type": "organisation" as const, id });
const domainOf = (company: string) => company.toLowerCase().replace(/\s+/g, "-") + ".example";

/**
 * The organisations below `rootId`, made up by this client: children, grandchildren and further down, each referring
 * to its parent. Identifiers carry random numbers (`org-4821`); each has a role other than registrar, a Card, statuses,
 * a contact and some users. Nothing names a registrar or its client identifiers.
 */
export function synthesizeDescendants(rootId: string, options: { seed?: number } = {}): Organisation[] {
  const numbers = distinctNumbers(options.seed ?? 1, SYNTHETIC_ORGANISATION_COUNT * 6);
  let next = SYNTHETIC_ORGANISATION_COUNT;
  const take = () => numbers[next++] ?? next;
  const idOf = (index: number) => `org-${numbers[index]}`;
  return ORGANISATIONS.map(({ company, parent, roles, statuses, users: count }, index) => {
    const users = Array.from({ length: count }, (_, user) => ({
      label: user === 0 ? "admin" : "tech",
      object: { "@type": "user", id: `user-${take()}` },
    }));
    return {
      "@type": "organisation",
      id: idOf(index),
      status: statuses.map((label) => ({ "@type": "organisationStatus", label })),
      roles: Object.fromEntries(roles.map((name) => [name, { "@type": "organisationRole" }])),
      parent: organisationRef(parent === "root" ? rootId : idOf(parent)),
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
