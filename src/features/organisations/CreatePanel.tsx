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
            hint="Chosen by you; it cannot be changed afterwards."
          />
          <OrganisationFields />
          <Callout tone="info" title="Users are added afterwards">
            Create the organisation first. Its users are created in it, on the User tabs, and each user identifier only has to be unique within this organisation.
          </Callout>
          <Callout tone="info" title="What the registry requires varies">
            Generally only a registry may create organisations. If something is missing or not allowed, the registry says which.
          </Callout>
          <div>
            <SubmitButton pending={create.pending}>Create organisation</SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome operation={create} success={`Created ${create.variables?.id.trim() || "the organisation"}`}>
        {(organisation) => <OrganisationDetails organisation={organisation} />}
      </OperationOutcome>
    </div>
  );
}
