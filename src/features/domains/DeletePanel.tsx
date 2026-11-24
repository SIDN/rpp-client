import { tryParseDomainName } from "@/application/domains/domainWorkflows";
import { ConfirmAction } from "../shared/ConfirmAction";
import { useDomainStore } from "./domainCache";
import { OperationOutcome } from "../shared/OperationOutcome";
import { NameField, type PanelProps } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { useOperation } from "../shared/useOperation";

export function DeletePanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const remove = useOperation(
    (variables: string, signal) => workflows.remove(variables, { signal }),
    (_result, variables) => store.forget(variables),
  );
  const target = name.trim();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-xl flex-col gap-5">
        <NameField name={name} onNameChange={onNameChange} />
        <div>
          <ConfirmAction
            destructive
            disabled={!tryParseDomainName(name)}
            trigger="Delete this domain"
            title={`Delete ${target}?`}
            confirmLabel={`Delete ${target}`}
            expected={target}
            pending={remove.pending}
            onConfirm={() => remove.start(target)}
          >
            The registry is asked to delete <code>{target}</code>. Only the sponsoring registrar may do this.
          </ConfirmAction>
        </div>
      </div>
      <OperationOutcome operation={remove} success={`Deleted ${remove.variables ?? "the domain"}`} />
    </div>
  );
}
