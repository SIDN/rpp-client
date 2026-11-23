import { EMPTY_ROLE, type ContactLinkData, type OrganisationData, type RoleData } from "@/application/organisations/organisationData";
import type { CardValues } from "./parts";

/** The form values of an organisation: its data, with the Card spread over three fields. */
export interface OrganisationValues extends CardValues {
  roles: RoleData[];
  parent: string;
  contacts: ContactLinkData[];
  clientStatuses: string[];
}

export const toValues = (data: OrganisationData): OrganisationValues => ({
  roles: data.roles.length > 0 ? data.roles : [EMPTY_ROLE],
  parent: data.parent,
  name: data.card.name,
  email: data.card.email,
  voice: data.card.voice,
  contacts: data.contacts,
  clientStatuses: data.clientStatuses,
});

/** Tolerates what a form being typed in holds: members still missing, and a lone checkbox as a string. */
export const toData = (values: Partial<OrganisationValues>): OrganisationData => ({
  roles: (values.roles ?? []).map((role) => ({ name: role?.name ?? "", roleId: role?.roleId ?? "", linkProhibited: Boolean(role?.linkProhibited) })),
  parent: values.parent ?? "",
  card: { name: values.name ?? "", email: values.email ?? "", voice: values.voice ?? "" },
  contacts: (values.contacts ?? []).map((link) => ({ label: link?.label ?? "", id: link?.id ?? "" })),
  clientStatuses: (values.clientStatuses ?? []).filter((label): label is string => typeof label === "string"),
});
