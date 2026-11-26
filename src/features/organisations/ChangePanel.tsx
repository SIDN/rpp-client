import { t } from "@/i18n";
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
import { UpdateModeSection } from "../shared/UpdateModeSection";
import { useObjectUpdate } from "../shared/useObjectUpdate";
import type { ObjectUpdate } from "@/application/updates/objectUpdate";
import { useCachedOrganisation, useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { OrganisationDetails } from "./OrganisationDetails";
import { OrganisationFields } from "./OrganisationFields";
import { toData, toValues, type OrganisationValues } from "./organisationValues";
import { OrganisationField, type PanelProps } from "./parts";

interface Change {
  id: string;
  update: ObjectUpdate;
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
  const plan = useObjectUpdate("organisation.update", organisation, operations);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => plan.update && change.start({ id: organisation.id, update: plan.update }))} noValidate className="flex max-w-xl flex-col gap-8">
        <h3>
          {t("organisations.change.heading", { id: organisation.id })}
        </h3>

        <OrganisationFields />

        <p className="text-sm text-muted-foreground">{t("organisations.change.usersHint")}</p>

        <section aria-label={t("organisations.change.preview")} className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h4 className="font-semibold">{t("organisations.change.preview")}</h4>
          {problem ? (
            <p className="text-muted-foreground">{t("organisations.form.problem", { message: problem })}</p>
          ) : operations.length === 0 ? (
            <p className="text-muted-foreground">{t("organisations.change.noChanges")}</p>
          ) : (
            <ul className="list-disc pl-5">
              {operations.map((operation, index) => (
                <li key={index}>{describeOrganisationOperation(operation)}</li>
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
    (variables: Change, signal) => workflows.update(variables.id, variables.update, { signal }),
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
        <p className="text-sm text-muted-foreground">{t("organisations.change.loadHint")}</p>
        <div>
          <SubmitButton pending={load.pending}>{organisation ? t("organisations.change.loadAgain") : t("organisations.change.load")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={load} success={t("organisations.change.loaded")} />

      {!organisation && !load.pending && !load.failure && !load.cancelled && !load.result && (
        <Callout tone="info" title={t("organisations.change.loadFirstTitle")}>
          {t("organisations.change.loadFirstDescription")}
        </Callout>
      )}
      {organisation && <ChangeForm key={JSON.stringify([organisation.id, organisationEditOf(organisation)])} organisation={organisation} change={change} />}
      <OperationOutcome operation={change} success={t("organisations.outcome.changed", { name: change.variables?.id ?? t("organisations.noun.organisation") })}>
        {(changed) => <OrganisationDetails organisation={changed} />}
      </OperationOutcome>
    </div>
  );
}
