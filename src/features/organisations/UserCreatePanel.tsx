import { t } from "@/i18n";
import { FormProvider, useForm } from "react-hook-form";
import { EMPTY_USER, type CreateUserInput } from "@/application/organisations/userData";
import { Callout } from "@/components/ui/callout";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import { useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { OrganisationField, UserField, type PanelProps } from "./parts";
import { UserDetails } from "./UserDetails";
import { UserFields } from "./UserFields";
import { toData, toValues, type UserValues } from "./userValues";

interface Creation {
  organisationId: string;
  input: CreateUserInput;
}

export function UserCreatePanel({ organisationId, onOrganisationChange, userId, onUserChange }: PanelProps) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const form = useForm<UserValues>({ defaultValues: toValues(EMPTY_USER) });

  const create = useOperation(
    (variables: Creation, signal) => workflows.users.create(variables.organisationId, variables.input, { signal }),
    (result, variables) => {
      if (result.data) store.rememberUser(variables.organisationId, variables.input.id, result.data);
    },
  );

  const submit = form.handleSubmit((values) => create.start({ organisationId, input: { id: userId, data: toData(values) } }));

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-8">
          <OrganisationField
            organisationId={organisationId}
            onOrganisationChange={onOrganisationChange}
            hint={t("organisations.userCreate.organisationHint")}
          />
          <UserField userId={userId} onUserChange={onUserChange} hint={t("organisations.userCreate.userIdHint")} />
          <UserFields statusHint={t("organisations.userCreate.statusHint")} />
          <Callout tone="info" title={t("organisations.create.requirementsTitle")}>
            {t("organisations.userCreate.requirementsDescription")}
          </Callout>
          <div>
            <SubmitButton pending={create.pending}>{t("organisations.action.createUser")}</SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome
        operation={create}
        success={t("organisations.outcome.userCreated", { user: create.variables?.input.id.trim() || t("organisations.noun.user"), organisation: create.variables?.organisationId.trim() || t("organisations.noun.organisation") })}
      >
        {(user) => <UserDetails user={user} />}
      </OperationOutcome>
    </div>
  );
}
