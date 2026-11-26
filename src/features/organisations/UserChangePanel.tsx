import { t } from "@/i18n";
import { useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { buildUserPatch, describeUserOperation, userEditOf } from "@/application/organisations/userData";
import { Callout } from "@/components/ui/callout";
import type { User } from "@/rpp/core/types/objects";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation, type Operation } from "../shared/useOperation";
import { UpdateModeSection } from "../shared/UpdateModeSection";
import { useObjectUpdate } from "../shared/useObjectUpdate";
import type { ObjectUpdate } from "@/application/updates/objectUpdate";
import { useCachedOrganisation, useCachedUser, useKnownUsers, useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { OrganisationField, type PanelProps } from "./parts";
import { UserDetails } from "./UserDetails";
import { UserFields } from "./UserFields";
import { UserTable } from "./UserTable";
import { toData, toValues, type UserValues } from "./userValues";

interface Target {
  organisationId: string;
  userId: string;
}

interface Change extends Target {
  update: ObjectUpdate;
}

function ChangeForm({ target, user, change }: { target: Target; user: User; change: Operation<Change, User> }) {
  const form = useForm<UserValues>({ defaultValues: toValues(userEditOf(user)) });
  const values = useWatch({ control: form.control });
  const operations = buildUserPatch(user, toData(values as Partial<UserValues>));
  const plan = useObjectUpdate("user.update", user, operations);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => plan.update && change.start({ ...target, update: plan.update }))} noValidate className="flex max-w-xl flex-col gap-8">
        <h3>
          {t("organisations.userChange.heading", { user: user.id, organisation: target.organisationId })}
        </h3>

        <UserFields statusHint={t("organisations.userChange.statusHint")} />

        <section aria-label={t("organisations.change.preview")} className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h4 className="font-semibold">{t("organisations.change.preview")}</h4>
          {operations.length === 0 ? (
            <p className="text-muted-foreground">{t("organisations.change.noChanges")}</p>
          ) : (
            <ul className="list-disc pl-5">
              {operations.map((operation, index) => (
                <li key={index}>{describeUserOperation(operation)}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            {t("organisations.change.previewHint")}
          </p>
          <UpdateModeSection plan={plan} />
        </section>

        <div>
          <SubmitButton pending={change.pending} disabled={!plan.update}>
            {t("organisations.action.saveChanges")}
          </SubmitButton>
        </div>
      </form>
    </FormProvider>
  );
}

export function UserChangePanel({ organisationId, onOrganisationChange, onUserChange }: PanelProps) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const organisation = useCachedOrganisation(organisationId);
  const users = useKnownUsers(organisationId);
  const [selected, setSelected] = useState<string>();
  const user = useCachedUser(organisationId, selected ?? "");

  const loadUsers = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );
  const load = useOperation(
    (variables: Target, signal) => workflows.users.info(variables.organisationId, variables.userId, { signal }),
    (result, variables) => {
      if (result.data) store.rememberUser(variables.organisationId, variables.userId, result.data);
    },
  );
  // Held here, not in the form: the form starts over when the saved user replaces the loaded one.
  const change = useOperation(
    (variables: Change, signal) => workflows.users.update(variables.organisationId, variables.userId, variables.update, { signal }),
    (result, variables) => {
      if (result.data) store.rememberUser(variables.organisationId, variables.userId, result.data);
    },
  );

  const choose = (id: string) => {
    setSelected(id);
    onUserChange(id);
    load.start({ organisationId: organisationId.trim(), userId: id });
  };

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
          onOrganisationChange={(id) => {
            setSelected(undefined);
            onOrganisationChange(id);
          }}
          hint={t("organisations.userChange.organisationHint")}
        />
        <div>
          <SubmitButton pending={loadUsers.pending}>{organisation ? t("organisations.userChange.loadUsersAgain") : t("organisations.userChange.showUsers")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={loadUsers} success={t("organisations.outcome.organisationLoaded", { organisation: loadUsers.variables?.trim() || t("organisations.noun.organisation") })} />

      {organisationId.trim() !== "" && (organisation || users.length > 0) && (
        <section aria-label={t("organisations.details.users")} className="flex flex-col gap-3">
          <h3>{t("organisations.userTable.caption", { id: organisationId.trim() })}</h3>
          <UserTable organisationId={organisationId.trim()} users={users} selected={selected} busy={load.pending} action="edit" onSelect={choose} />
        </section>
      )}
      {!organisation && users.length === 0 && !loadUsers.pending && !loadUsers.failure && !loadUsers.cancelled && !loadUsers.result && (
        <Callout tone="info" title={t("organisations.userChange.pickUserTitle")}>
          {t("organisations.userChange.pickUserDescription")}
        </Callout>
      )}

      <OperationOutcome operation={load} success={t("organisations.outcome.userLoaded", { user: load.variables?.userId ?? t("organisations.noun.user") })} />
      {selected && user && !load.pending && (
        <ChangeForm
          key={JSON.stringify([organisationId.trim(), selected, userEditOf(user)])}
          target={{ organisationId: organisationId.trim(), userId: selected }}
          user={user}
          change={change}
        />
      )}
      <OperationOutcome operation={change} success={t("organisations.outcome.userChanged", { user: change.variables?.userId ?? t("organisations.noun.user"), organisation: change.variables?.organisationId ?? t("organisations.noun.organisation") })}>
        {(changed) => <UserDetails user={changed} />}
      </OperationOutcome>
    </div>
  );
}
