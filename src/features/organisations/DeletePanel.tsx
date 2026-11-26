import { t } from "@/i18n";
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

  const noun = users.length === 1 ? t("organisations.delete.userCount.one") : t("organisations.delete.userCount.other", { count: users.length });

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
          hint={t("organisations.delete.organisationHint")}
        />
        <div>
          <SubmitButton pending={check.pending}>{organisation ? t("organisations.delete.checkAgain") : t("organisations.delete.checkOrganisation")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={check} success={t("organisations.outcome.checked", { name: check.variables?.trim() || t("organisations.noun.organisation") })} />

      {organisation && (
        <section aria-label={t("organisations.delete.beforeDeleting")} className="flex max-w-xl flex-col gap-4">
          {users.length === 0 ? (
            <Callout tone="info" title={t("organisations.delete.noUsersTitle")}>
              {t("organisations.delete.onlyOrganisation", { id })}
            </Callout>
          ) : (
            <>
              <Callout tone="warning" title={t("organisations.delete.hasUsers", { noun })}>
                <ul className="list-disc pl-5">
                  {users.map((user) => (
                    <li key={user}>
                      <code>{user}</code>
                    </li>
                  ))}
                </ul>
                <p className="mt-2">{t("organisations.delete.usersMustBeDeletedFirst")}</p>
              </Callout>
              <Choice
                type="checkbox"
                label={t("organisations.delete.deleteUsersLabel")}
                hint={t("organisations.delete.deleteUsersHint")}
                checked={deleteUsers}
                onChange={(event) => setDeleteUsers(event.target.checked)}
              />
              {deleteUsers && (
                <Callout tone="warning" title={t("organisations.delete.usersWillAlsoBeDeleted", { noun })}>
                  {t("organisations.delete.irreversibleDescription")}
                </Callout>
              )}
            </>
          )}

          {users.length > 0 && !deleteUsers && (
            <p className="text-sm text-muted-foreground">
              {t("organisations.delete.deleteUsersAlternative")}
            </p>
          )}
        </section>
      )}

      <div>
        <ConfirmAction
          destructive
          disabled={id === "" || (users.length > 0 && !deleteUsers)}
          trigger={t("organisations.delete.trigger")}
          title={t("organisations.delete.confirmTitle", { id })}
          confirmLabel={t("organisations.delete.confirm", { id })}
          expected={id}
          pending={remove.pending}
          onConfirm={() => {
            setDeleted([]);
            remove.start({ id, deleteUsers });
          }}
        >
          {users.length > 0
            ? t("organisations.delete.confirmDescriptionWithUsers", { id, noun })
            : t("organisations.delete.confirmDescription", { id })}
        </ConfirmAction>
      </div>

      {deleted.length > 0 && !remove.result && (
        <p role="status" className="text-sm">
          {t("organisations.delete.usersDeletedSoFar")} {deleted.map((user) => (
            <code key={user} className="mr-2">
              {user}
            </code>
          ))}
        </p>
      )}
      <OperationOutcome operation={remove} success={t("organisations.outcome.deleted", { name: remove.variables?.id ?? t("organisations.noun.organisation") })}>
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
