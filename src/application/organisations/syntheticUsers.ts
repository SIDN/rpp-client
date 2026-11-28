import { t } from "@/i18n";
import type { User } from "@/rpp/core/types/objects";
import { invalidRequest } from "@/rpp/operations/paths";
import { distinctNumbers } from "../search/synthesize";
import { cardOf } from "./card";
import type { UserLink } from "./organisationData";
import { createBody, type CreateUserInput } from "./userData";

/** A made-up user, with the role label the organisation would list it under. */
export interface SyntheticUser {
  user: User;
  label: string;
}

const PEOPLE = [
  ["Anna", "de Vries"], ["Bram", "Jansen"], ["Clara", "Bakker"], ["Daan", "Visser"], ["Eva", "Smit"], ["Finn", "Meijer"], ["Greta", "Mulder"],
] as const;
const ROLES = ["admin", "tech", "billing", "admin", "tech", "abuse", "billing"] as const;
/** Every status a user can be read with (data-objects 16), so that each shows up. */
const STATUSES = ["active", "active", "pending", "active", "suspended", "active", "deactivated"] as const;

export const SYNTHETIC_USER_COUNT = PEOPLE.length;

function description(role: string): string {
  switch (role) {
    case "admin": return t("users.synthetic.role.admin");
    case "tech": return t("users.synthetic.role.tech");
    case "billing": return t("users.synthetic.role.billing");
    default: return t("users.synthetic.role.abuse");
  }
}

const organisationRef = (id: string) => ({ "@type": "organisation", id });

/**
 * The users of an organisation, made up by this client: identifiers with random numbers (`user-4821`), a Card with a
 * name, an email address and a phone number, a description and a status. Nothing names a registrar.
 */
export function synthesizeUsers(organisationId: string, options: { seed?: number } = {}): SyntheticUser[] {
  const numbers = distinctNumbers(options.seed ?? 1, SYNTHETIC_USER_COUNT);
  return PEOPLE.map(([first, last], index) => {
    const role = ROLES[index] ?? "admin";
    const email = `${first}.${last}`.toLowerCase().replace(/\s+/g, "") + "@example.test";
    return {
      label: role,
      user: {
        "@type": "user",
        id: `user-${numbers[index]}`,
        details: cardOf({ name: `${first} ${last}`, email, voice: `+31.70${String(5550100 + index * 7).padStart(7, "0")}` }),
        description: description(role),
        status: { "@type": "userStatus", label: STATUSES[index] ?? "active" },
        organisation: organisationRef(organisationId),
      } as User,
    };
  });
}

export const syntheticLinks = (users: readonly SyntheticUser[]): UserLink[] => users.map(({ user, label }) => ({ id: user.id, label }));

/** A new made-up user, as the create form describes it. The registry would set the status; here it is `active` unless chosen. */
export function createSyntheticUser(organisationId: string, input: CreateUserInput, existing: readonly SyntheticUser[]): SyntheticUser {
  const body = createBody(input);
  if (existing.some(({ user }) => user.id === body.id)) throw invalidRequest(t("users.synthetic.exists", { id: body.id }));
  return {
    label: "",
    user: { ...body, status: body.status ?? { "@type": "userStatus", label: "active" }, organisation: organisationRef(organisationId) } as User,
  };
}
