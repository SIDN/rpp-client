import { contactLinksOf, roleStatusesOf, rolesOf } from "@/application/organisations/organisationData";
import { cardDataOf } from "@/application/organisations/card";
import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { StatusLabel } from "@/components/protocol/protocol-badges";
import { isJsonObject } from "@/rpp/core/types/json";
import type { Organisation } from "@/rpp/core/types/objects";
import { JsonView, OtherMembers, Provisioning } from "../shared/objectParts";
import { StatusList } from "./parts";

const MODELLED = new Set(["@type", "id", "provMetadata", "status", "roles", "parent", "contactInfo", "contacts", "users", "processes"]);

const value = (text: string) => (text === "" ? <Nothing>Not given</Nothing> : text);

/** Everything the server showed of an organisation; members this client does not model follow, as received. */
export function OrganisationDetails({ organisation }: { organisation: Organisation }) {
  const roles = rolesOf(organisation);
  const card = cardDataOf(organisation.contactInfo);
  const contacts = contactLinksOf(organisation);
  const users = (Array.isArray(organisation.users) ? organisation.users : []).map((entry) => ({
    label: isJsonObject(entry) && typeof entry.label === "string" ? entry.label : "",
    id: isJsonObject(entry) && isJsonObject(entry.object) && typeof entry.object.id === "string" ? entry.object.id : "",
  }));
  const parent = isJsonObject(organisation.parent) && typeof organisation.parent.id === "string" ? organisation.parent.id : "";
  const processes = organisation.processes ? Object.entries(organisation.processes).filter(([key]) => key !== "@type") : [];
  const others = Object.entries(organisation).filter(([key]) => !MODELLED.has(key));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="flex flex-wrap items-baseline gap-x-3 text-xl">
          <code>{organisation.id}</code>
          {card.name && <span className="font-normal">{card.name}</span>}
        </h3>
        <StatusList type="organisationStatus" statuses={Array.isArray(organisation.status) ? organisation.status : []} />
      </div>

      <DefinitionList>
        <DefinitionRow term="Roles">
          {roles.length === 0 ? (
            <Nothing />
          ) : (
            <ul className="flex flex-col gap-2">
              {roles.map((role) => (
                <li key={role.name} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <code>{role.name}</code>
                  {role.roleId && <span className="text-sm text-muted-foreground">identifier <code>{role.roleId}</code></span>}
                  {roleStatusesOf(organisation, role.name).map((label, index) => (
                    <StatusLabel key={`${label}-${index}`} type="organisationRoleStatus" label={label} />
                  ))}
                </li>
              ))}
            </ul>
          )}
        </DefinitionRow>
        <DefinitionRow term="Parent">{parent ? <code>{parent}</code> : <Nothing />}</DefinitionRow>
        <DefinitionRow term="Name">{value(card.name)}</DefinitionRow>
        <DefinitionRow term="Email">{value(card.email)}</DefinitionRow>
        <DefinitionRow term="Phone">{card.voice ? <code>{card.voice}</code> : <Nothing>Not given</Nothing>}</DefinitionRow>
        <DefinitionRow term="Contacts">
          {contacts.length === 0 ? (
            <Nothing />
          ) : (
            <ul className="flex flex-col gap-1">
              {contacts.map((link) => (
                <li key={`${link.label}-${link.id}`}>
                  <span className="text-muted-foreground">{link.label}</span> <code>{link.id}</code>
                </li>
              ))}
            </ul>
          )}
        </DefinitionRow>
        <DefinitionRow term="Users">
          {users.length === 0 ? (
            <Nothing />
          ) : (
            <ul className="flex flex-col gap-1">
              {users.map((user) => (
                <li key={`${user.label}-${user.id}`}>
                  <code>{user.id}</code> {user.label && <span className="text-muted-foreground">{user.label}</span>}
                </li>
              ))}
            </ul>
          )}
        </DefinitionRow>
        <DefinitionRow term="Provisioning">
          <Provisioning metadata={organisation.provMetadata} />
        </DefinitionRow>
        <DefinitionRow term="Processes">
          {processes.length === 0 ? (
            <Nothing />
          ) : (
            <ul className="flex flex-col gap-1">
              {processes.map(([kind, list]) => (
                <li key={kind}>
                  <code>{kind}</code>{" "}
                  {Array.isArray(list) ? list.map((entry: { processId?: string }) => entry.processId).filter(Boolean).join(", ") : ""}
                </li>
              ))}
            </ul>
          )}
        </DefinitionRow>
        {others.length > 0 && (
          <DefinitionRow term="Other members">
            <OtherMembers members={others} />
          </DefinitionRow>
        )}
      </DefinitionList>

      <JsonView label="Organisation as received" value={organisation} />
    </div>
  );
}
