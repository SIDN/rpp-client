import { t } from "@/i18n";
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
    { keep: "organisations/userDelete.loadUsers" },
  );
  const remove = useOperation(
    (variables: Target, signal) => workflows.users.remove(variables.organisationId, variables.userId, { signal }),
    (_result, variables) => {
      store.unlinkUser(variables.organisationId, variables.userId);
      store.forgetUser(variables.organisationId, variables.userId);
      setSelected(undefined);
    },
    { keep: "organisations/userDelete.remove" },
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
          hint={t("organisations.userDelete.organisationHint")}
        />
        <div>
          <SubmitButton pending={loadUsers.pending}>{organisation ? t("organisations.userChange.loadUsersAgain") : t("organisations.userChange.showUsers")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={loadUsers} success={t("organisations.outcome.organisationLoaded", { organisation: loadUsers.variables?.trim() || t("organisations.noun.organisation") })} />

      {id !== "" && (organisation || users.length > 0) && (
        <section aria-label={t("organisations.details.users")} className="flex flex-col gap-3">
          <h3>{t("organisations.userTable.caption", { id })}</h3>
          <UserTable
            organisationId={id}
            users={users}
            selected={selected}
            busy={remove.pending}
            action="choose"
            onSelect={(userId) => {
              setSelected(userId);
              onUserChange(userId);
            }}
            empty={t("organisations.userDelete.noUsersDescription")}
          />
        </section>
      )}
      {!organisation && users.length === 0 && !loadUsers.pending && !loadUsers.failure && !loadUsers.cancelled && !loadUsers.result && (
        <Callout tone="info" title={t("organisations.userDelete.pickUserTitle")}>
          {t("organisations.userDelete.pickUserDescription")}
        </Callout>
      )}

      <section aria-label={t("organisations.userDelete.sectionLabel")} className="flex max-w-xl flex-col gap-4">
        {selected && (
          <Callout tone="warning" title={t("organisations.userDelete.irreversibleTitle")}>
            {t("organisations.userDelete.onlyUser", { user: selected, organisation: id })}
          </Callout>
        )}
        <div>
          <ConfirmAction
            destructive
            disabled={!selected}
            trigger={t("organisations.userDelete.trigger")}
            title={t("organisations.userDelete.confirmTitle", { user: selected ?? "", organisation: id })}
            confirmLabel={t("organisations.userDelete.confirm", { user: selected ?? "" })}
            expected={selected}
            pending={remove.pending}
            onConfirm={() => selected && remove.start({ organisationId: id, userId: selected })}
          >
            {t("organisations.userDelete.confirmDescription", { user: selected ?? "", organisation: id })}
          </ConfirmAction>
        </div>
      </section>
      <OperationOutcome operation={remove} success={t("organisations.outcome.userDeleted", { user: remove.variables?.userId ?? t("organisations.noun.user"), organisation: remove.variables?.organisationId ?? t("organisations.noun.organisation") })} />
    </div>
  );
}
