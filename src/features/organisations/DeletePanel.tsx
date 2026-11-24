import { useState } from "react";
import { userLinksOf } from "@/application/organisations/organisationData";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { ConfirmAction } from "../shared/ConfirmAction";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import { useCachedOrganisation, useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { OrganisationField, type PanelProps } from "./parts";

interface Removal {
  id: string;
  deleteUsers: boolean;
}

export function DeletePanel({ organisationId, onOrganisationChange }: PanelProps) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const organisation = useCachedOrganisation(organisationId);
  const [deleteUsers, setDeleteUsers] = useState(false);
  const [deleted, setDeleted] = useState<string[]>([]);
  const id = organisationId.trim();
  const users = userLinksOf(organisation).map((user) => user.id);

  const check = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );
  const remove = useOperation(
    (variables: Removal, signal) =>
      workflows.remove(variables.id, {
        signal,
        deleteUsers: variables.deleteUsers,
        onUserDeleted: (userId) => {
          setDeleted((done) => [...done, userId]);
          store.unlinkUser(variables.id, userId);
          store.forgetUser(variables.id, userId);
        },
      }),
    (_result, variables) => {
      store.forgetUsersOf(variables.id);
      store.forgetOrganisation(variables.id);
    },
  );

  const noun = users.length === 1 ? "1 user" : `${users.length} users`;

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          check.start(organisationId);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <OrganisationField
          organisationId={organisationId}
          onOrganisationChange={(next) => {
            setDeleteUsers(false);
            onOrganisationChange(next);
          }}
          hint="The organisation is checked first, for users that are still linked to it."
        />
        <div>
          <SubmitButton pending={check.pending}>{organisation ? "Check again" : "Check the organisation"}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={check} success={`Checked ${check.variables?.trim() || "the organisation"}`} />

      {organisation && (
        <section aria-label="Before deleting" className="flex max-w-xl flex-col gap-4">
          {users.length === 0 ? (
            <Callout tone="info" title="No users are linked to this organisation">
              Deleting <code>{id}</code> removes only the organisation.
            </Callout>
          ) : (
            <>
              <Callout tone="warning" title={`This organisation still has ${noun}`}>
                <ul className="list-disc pl-5">
                  {users.map((user) => (
                    <li key={user}>
                      <code>{user}</code>
                    </li>
                  ))}
                </ul>
                <p className="mt-2">An organisation with users cannot be deleted, unless its users are deleted with it.</p>
              </Callout>
              <Choice
                type="checkbox"
                label="Delete all organisation users"
                hint="Optional. The users are deleted first, one at a time, and then the organisation."
                checked={deleteUsers}
                onChange={(event) => setDeleteUsers(event.target.checked)}
              />
              {deleteUsers && (
                <Callout tone="warning" title={`${noun} will be deleted as well`}>
                  Deleting a user cannot be undone, and neither can deleting the organisation. If a user cannot be deleted, the organisation is left as it is, with the users that were already deleted gone.
                </Callout>
              )}
            </>
          )}

          {users.length > 0 && !deleteUsers && (
            <p className="text-sm text-muted-foreground">
              Check the box to delete the users with the organisation, or delete them one at a time on the Delete user tab.
            </p>
          )}
        </section>
      )}

      <div>
        <ConfirmAction
          destructive
          disabled={id === "" || (users.length > 0 && !deleteUsers)}
          trigger="Delete this organisation"
          title={`Delete ${id}?`}
          confirmLabel={`Delete ${id}`}
          expected={id}
          pending={remove.pending}
          onConfirm={() => {
            setDeleted([]);
            remove.start({ id, deleteUsers });
          }}
        >
          The registry is asked to delete <code>{id}</code>
          {users.length > 0 && <> and its {noun}</>}. Generally only a registry may do this.
        </ConfirmAction>
      </div>

      {deleted.length > 0 && !remove.result && (
        <p role="status" className="text-sm">
          Users deleted so far: {deleted.map((user) => (
            <code key={user} className="mr-2">
              {user}
            </code>
          ))}
        </p>
      )}
      <OperationOutcome operation={remove} success={`Deleted ${remove.variables?.id ?? "the organisation"}`}>
        {(removed) =>
          removed.deletedUsers.length > 0 ? (
            <p className="text-sm">
              Its users were deleted too:{" "}
              {removed.deletedUsers.map((user) => (
                <code key={user} className="mr-2">
                  {user}
                </code>
              ))}
            </p>
          ) : null
        }
      </OperationOutcome>
    </div>
  );
}
