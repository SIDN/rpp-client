import { useOperation } from "../shared/useOperation";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { tryParseHostName } from "@/application/hosts/hostWorkflows";
import { useHostStore, useHostWorkflows } from "./hostHooks";
import { HostDetails } from "./HostDetails";
import { NameField, type PanelProps } from "./parts";

export function InfoPanel({ name, onNameChange }: PanelProps) {
  const workflows = useHostWorkflows();
  const store = useHostStore();
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
          info.start(name);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <NameField name={name} onNameChange={onNameChange} />
        <div>
          <SubmitButton pending={info.pending}>Get info</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={info} success={`Found ${tryParseHostName(info.variables ?? "")?.name ?? "the host"}`}>
        {(host) => <HostDetails host={host} />}
      </OperationOutcome>
    </div>
  );
}
