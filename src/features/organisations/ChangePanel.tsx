import { t } from "@/i18n";
import { FormProvider, useWatch } from "react-hook-form";
import { useDraftForm } from "../shared/drafts";
import { ResetButton } from "../shared/DraftActions";
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
import { useCachedOrganisation, useLoadedOrganisation, useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
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

/** `version` names the organisation as loaded: what was typed for another one or state of it is not given back. */
function ChangeForm({ organisation, version, change }: { organisation: Organisation; version: string; change: Operation<Change, Organisation> }) {
  const loaded = toValues(organisationEditOf(organisation));
  const draft = useDraftForm<OrganisationValues>("organisations/change", loaded, version);
  const { form } = draft;
  const values = useWatch({ control: form.control });
  const { operations, problem } = planOf(organisation, toData(values as Partial<OrganisationValues>));

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => change.start({ id: organisation.id, operations }))} noValidate className="flex max-w-xl flex-col gap-8">
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
        </section>

        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={change.pending} disabled={operations.length === 0}>
            {t("organisations.action.saveChanges")}
          </SubmitButton>
          <ResetButton draft={draft} to={loaded}>
            {t("shared.form.discard")}
          </ResetButton>
        </div>
      </form>
    </FormProvider>
  );
}

export function ChangePanel({ organisationId, onOrganisationChange }: PanelProps) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const organisation = useCachedOrganisation(organisationId);
  const { setLoaded } = useLoadedOrganisation();

  const load = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (!result.data) return;
      store.remember(variables, result.data);
      setLoaded(variables);
    },
    { keep: "organisations/change.load" },
  );
  // Held here, not in the form: the form starts over when the saved organisation replaces the loaded one.
  const change = useOperation(
    (variables: Change, signal) => workflows.change(variables.id, variables.operations, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.id, result.data);
    },
    { keep: "organisations/change.change" },
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
      {organisation && (
        <ChangeForm
          key={JSON.stringify([organisation.id, organisationEditOf(organisation)])}
          version={JSON.stringify([organisation.id, organisationEditOf(organisation)])}
          organisation={organisation}
          change={change}
        />
      )}
      <OperationOutcome operation={change} success={t("organisations.outcome.changed", { name: change.variables?.id ?? t("organisations.noun.organisation") })}>
        {(changed) => <OrganisationDetails organisation={changed} />}
      </OperationOutcome>
    </div>
  );
}
