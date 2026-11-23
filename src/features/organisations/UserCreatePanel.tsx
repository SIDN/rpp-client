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
            hint="A user is always created in an organisation, which must exist already."
          />
          <UserField userId={userId} onUserChange={onUserChange} hint="Chosen by you. It only has to be unique within this organisation, and cannot be changed afterwards." />
          <UserFields statusHint="Leave it to the registry, or create the user suspended or deactivated." />
          <Callout tone="info" title="What the registry requires varies">
            Generally the organisation itself, or the registry, may create its users. If something is missing or not allowed, the registry says which.
          </Callout>
          <div>
            <SubmitButton pending={create.pending}>Create user</SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome
        operation={create}
        success={`Created ${create.variables?.input.id.trim() || "the user"} in ${create.variables?.organisationId.trim() || "the organisation"}`}
      >
        {(user) => <UserDetails user={user} />}
      </OperationOutcome>
    </div>
  );
}
