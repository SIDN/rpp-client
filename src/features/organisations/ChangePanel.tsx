import { FormProvider, useForm, useWatch } from "react-hook-form";
import {
  buildOrganisationPatch,
  describeOrganisationOperation,
  organisationEditOf,
  type OrganisationData,
} from "@/application/organisations/organisationData";
import { Callout } from "@/components/ui/callout";
import type { Organisation } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation, type Operation } from "../shared/useOperation";
import { useCachedOrganisation, useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { OrganisationDetails } from "./OrganisationDetails";
import { OrganisationFields } from "./OrganisationFields";
import { toData, toValues, type OrganisationValues } from "./organisationValues";
import { OrganisationField, type PanelProps } from "./parts";

interface Change {
  id: string;
  operations: readonly PatchOperation[];
}

/** The operations for what is typed so far, or why there are none yet: a form half filled in is not an error. */
function planOf(organisation: Organisation, data: OrganisationData): { operations: PatchOperation[]; problem?: string } {
  try {
    return { operations: buildOrganisationPatch(organisation, data) };
  } catch (error) {
    return { operations: [], problem: error instanceof Error ? error.message : String(error) };
  }
}

function ChangeForm({ organisation, change }: { organisation: Organisation; change: Operation<Change, Organisation> }) {
  const form = useForm<OrganisationValues>({ defaultValues: toValues(organisationEditOf(organisation)) });
  const values = useWatch({ control: form.control });
  const { operations, problem } = planOf(organisation, toData(values as Partial<OrganisationValues>));

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => change.start({ id: organisation.id, operations }))} noValidate className="flex max-w-xl flex-col gap-8">
        <h3>
          Change <code>{organisation.id}</code>
        </h3>

        <OrganisationFields />

        <p className="text-sm text-muted-foreground">The users of the organisation are changed on the User tabs.</p>

        <section aria-label="Changes to send" className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h4 className="font-semibold">Changes to send</h4>
          {problem ? (
            <p className="text-muted-foreground">{problem}.</p>
          ) : operations.length === 0 ? (
            <p className="text-muted-foreground">Nothing has been changed yet.</p>
          ) : (
            <ul className="list-disc pl-5">
              {operations.map((operation, index) => (
                <li key={index}>{describeOrganisationOperation(operation)}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            Only these changes are sent, as one partial update that the registry carries out completely or not at all. The registry decides which of them it allows.
          </p>
        </section>

        <div>
          <SubmitButton pending={change.pending} disabled={operations.length === 0}>
            Save changes
          </SubmitButton>
        </div>
      </form>
    </FormProvider>
  );
}

export function ChangePanel({ organisationId, onOrganisationChange }: PanelProps) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const organisation = useCachedOrganisation(organisationId);

  const load = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );
  // Held here, not in the form: the form starts over when the saved organisation replaces the loaded one.
  const change = useOperation(
    (variables: Change, signal) => workflows.change(variables.id, variables.operations, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.id, result.data);
    },
  );

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          load.start(organisationId);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <OrganisationField organisationId={organisationId} onOrganisationChange={onOrganisationChange} />
        <p className="text-sm text-muted-foreground">What changes is worked out from what the registry holds now, so the organisation is loaded first.</p>
        <div>
          <SubmitButton pending={load.pending}>{organisation ? "Load again" : "Load the organisation"}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={load} success="Loaded the current data" />

      {!organisation && !load.pending && !load.failure && !load.cancelled && !load.result && (
        <Callout tone="info" title="Load the organisation to change it">
          The form appears here with the roles, contacts and locks of the organisation as they are now.
        </Callout>
      )}
      {organisation && <ChangeForm key={JSON.stringify([organisation.id, organisationEditOf(organisation)])} organisation={organisation} change={change} />}
      <OperationOutcome operation={change} success={`Changed ${change.variables?.id ?? "the organisation"}`}>
        {(changed) => <OrganisationDetails organisation={changed} />}
      </OperationOutcome>
    </div>
  );
}
