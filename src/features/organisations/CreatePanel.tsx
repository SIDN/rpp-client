import { t } from "@/i18n";
import { FormProvider, useForm } from "react-hook-form";
import { EMPTY_ORGANISATION, type CreateOrganisationInput } from "@/application/organisations/organisationData";
import { Callout } from "@/components/ui/callout";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import { useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { OrganisationDetails } from "./OrganisationDetails";
import { OrganisationFields } from "./OrganisationFields";
import { toData, toValues, type OrganisationValues } from "./organisationValues";
import { OrganisationField, type PanelProps } from "./parts";

export function CreatePanel({ organisationId, onOrganisationChange }: PanelProps) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const form = useForm<OrganisationValues>({ defaultValues: toValues(EMPTY_ORGANISATION) });

  const create = useOperation(
    (input: CreateOrganisationInput, signal) => workflows.create(input, { signal }),
    (result, input) => {
      if (result.data) store.remember(input.id, result.data);
    },
  );

  const submit = form.handleSubmit((values) => create.start({ id: organisationId, data: toData(values) }));

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-8">
          <OrganisationField
            organisationId={organisationId}
            onOrganisationChange={onOrganisationChange}
            hint={t("organisations.create.idHint")}
          />
          <OrganisationFields />
          <Callout tone="info" title={t("organisations.create.usersAfterwardTitle")}>
            {t("organisations.create.usersAfterwardDescription")}
          </Callout>
          <Callout tone="info" title={t("organisations.create.requirementsTitle")}>
            {t("organisations.create.requirementsDescription")}
          </Callout>
          <div>
            <SubmitButton pending={create.pending}>{t("organisations.action.createOrganisation")}</SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome operation={create} success={t("organisations.outcome.created", { name: create.variables?.id.trim() || t("organisations.noun.organisation") })}>
        {(organisation) => <OrganisationDetails organisation={organisation} />}
      </OperationOutcome>
    </div>
  );
}
