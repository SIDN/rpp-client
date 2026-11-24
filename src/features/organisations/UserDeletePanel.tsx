import { useState } from "react";
import { Callout } from "@/components/ui/callout";
import { ConfirmAction } from "../shared/ConfirmAction";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import { useCachedOrganisation, useKnownUsers, useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { OrganisationField, type PanelProps } from "./parts";
import { UserTable } from "./UserTable";

interface Target {
  organisationId: string;
  userId: string;
}

export function UserDeletePanel({ organisationId, onOrganisationChange, onUserChange }: PanelProps) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const organisation = useCachedOrganisation(organisationId);
  const users = useKnownUsers(organisationId);
  const [selected, setSelected] = useState<string>();
  const id = organisationId.trim();

  const loadUsers = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );
  const remove = useOperation(
    (variables: Target, signal) => workflows.users.remove(variables.organisationId, variables.userId, { signal }),
    (_result, variables) => {
      store.unlinkUser(variables.organisationId, variables.userId);
      store.forgetUser(variables.organisationId, variables.userId);
      setSelected(undefined);
    },
  );

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          loadUsers.start(organisationId);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <OrganisationField
          organisationId={organisationId}
          onOrganisationChange={(next) => {
            setSelected(undefined);
            onOrganisationChange(next);
          }}
          hint="The organisation whose user you want to delete."
        />
        <div>
          <SubmitButton pending={loadUsers.pending}>{organisation ? "Load the users again" : "Show the users"}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={loadUsers} success={`Loaded ${loadUsers.variables?.trim() || "the organisation"}`} />

      {id !== "" && (organisation || users.length > 0) && (
        <section aria-label="Users" className="flex flex-col gap-3">
          <h3>Users of {id}</h3>
          <UserTable
            organisationId={id}
            users={users}
            selected={selected}
            busy={remove.pending}
            action="Choose"
            onSelect={(userId) => {
              setSelected(userId);
              onUserChange(userId);
            }}
            empty="This organisation lists no users, and none was read or created in this session."
          />
        </section>
      )}
      {!organisation && users.length === 0 && !loadUsers.pending && !loadUsers.failure && !loadUsers.cancelled && !loadUsers.result && (
        <Callout tone="info" title="Show the users of an organisation to pick one">
          The users the organisation lists appear here. Choose the one to delete.
        </Callout>
      )}

      <section aria-label="Delete the user" className="flex max-w-xl flex-col gap-4">
        {selected && (
          <Callout tone="warning" title="Deleting a user cannot be undone">
            Only <code>{selected}</code> is deleted. The organisation <code>{id}</code> and its other users stay.
          </Callout>
        )}
        <div>
          <ConfirmAction
            destructive
            disabled={!selected}
            trigger="Delete this user"
            title={`Delete ${selected} from ${id}?`}
            confirmLabel={`Delete ${selected}`}
            expected={selected}
            pending={remove.pending}
            onConfirm={() => selected && remove.start({ organisationId: id, userId: selected })}
          >
            The registry is asked to delete the user <code>{selected}</code> of <code>{id}</code>.
          </ConfirmAction>
        </div>
      </section>
      <OperationOutcome operation={remove} success={`Deleted ${remove.variables?.userId ?? "the user"} from ${remove.variables?.organisationId ?? "the organisation"}`} />
    </div>
  );
}
