import { SubmitButton } from "../shared/SubmitButton";
import { OperationOutcome } from "../shared/OperationOutcome";
import { useOperation } from "../shared/useOperation";
import { useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { OrganisationDetails } from "./OrganisationDetails";
import { OrganisationField, type PanelProps } from "./parts";

export function InfoPanel({ organisationId, onOrganisationChange }: PanelProps) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const info = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );

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
          <SubmitButton pending={info.pending}>Get info</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={info} success={`Found ${info.variables?.trim() || "the organisation"}`}>
        {(organisation) => <OrganisationDetails organisation={organisation} />}
      </OperationOutcome>
    </div>
  );
}
