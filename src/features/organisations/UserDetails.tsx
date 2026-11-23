import { cardDataOf } from "@/application/organisations/card";
import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { isJsonObject } from "@/rpp/core/types/json";
import type { User } from "@/rpp/core/types/objects";
import { JsonView, OtherMembers } from "../shared/objectParts";
import { StatusList } from "./parts";

const MODELLED = new Set(["@type", "id", "details", "description", "status", "organisation", "processes"]);

const value = (text: string) => (text === "" ? <Nothing>Not given</Nothing> : text);

/** Everything the server showed of a user; members this client does not model follow, as received. */
export function UserDetails({ user }: { user: User }) {
  const card = cardDataOf(user.details);
  const organisation = isJsonObject(user.organisation) && typeof user.organisation.id === "string" ? user.organisation.id : "";
  const status = isJsonObject(user.status) ? [user.status as { label: string; reason?: string; due?: string }] : [];
  const processes = user.processes ? Object.entries(user.processes).filter(([key]) => key !== "@type") : [];
  const others = Object.entries(user).filter(([key]) => !MODELLED.has(key));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="flex flex-wrap items-baseline gap-x-3 text-xl">
          <code>{user.id}</code>
          {card.name && <span className="font-normal">{card.name}</span>}
        </h3>
        <StatusList type="userStatus" statuses={status} />
      </div>

      <DefinitionList>
        <DefinitionRow term="Organisation">{organisation ? <code>{organisation}</code> : <Nothing>Not given</Nothing>}</DefinitionRow>
        <DefinitionRow term="Name">{value(card.name)}</DefinitionRow>
        <DefinitionRow term="Email">{value(card.email)}</DefinitionRow>
        <DefinitionRow term="Phone">{card.voice ? <code>{card.voice}</code> : <Nothing>Not given</Nothing>}</DefinitionRow>
        <DefinitionRow term="Description">{value(typeof user.description === "string" ? user.description : "")}</DefinitionRow>
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

      <JsonView label="User as received" value={user} />
    </div>
  );
}
