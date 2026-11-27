import { useEffect, useRef } from "react";
import { t } from "@/i18n";
import { SubmitButton } from "../shared/SubmitButton";
import { OperationOutcome } from "../shared/OperationOutcome";
import { useOperation } from "../shared/useOperation";
import { useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { OrganisationDetails } from "./OrganisationDetails";
import { OrganisationField, type PanelProps } from "./parts";

/** `startNow` asks for the info of the organisation as soon as the panel is shown, as when a link leads here. */
export function InfoPanel({ organisationId, onOrganisationChange, startNow = false }: PanelProps & { startNow?: boolean }) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const info = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );

  const started = useRef(false);
  const { start } = info;
  useEffect(() => {
    if (!startNow || started.current || organisationId.trim() === "") return;
    started.current = true;
    start(organisationId);
  }, [startNow, organisationId, start]);

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          info.start(organisationId);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <OrganisationField organisationId={organisationId} onOrganisationChange={onOrganisationChange} />
        <div>
          <SubmitButton pending={info.pending}>{t("organisations.action.getInfo")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={info} success={t("organisations.outcome.found", { name: info.variables?.trim() || t("organisations.noun.organisation") })}>
        {(organisation) => <OrganisationDetails organisation={organisation} />}
      </OperationOutcome>
    </div>
  );
}
