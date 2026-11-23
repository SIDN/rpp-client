import { Callout } from "@/components/ui/callout";
import { tryParseHostName } from "@/application/hosts/hostWorkflows";
import { ConfirmAction } from "../shared/ConfirmAction";
import { OperationOutcome } from "../shared/OperationOutcome";
import { useOperation } from "../shared/useOperation";
import { useHostStore, useHostWorkflows } from "./hostHooks";
import { NameField, type PanelProps } from "./parts";

export function DeletePanel({ name, onNameChange }: PanelProps) {
  const workflows = useHostWorkflows();
  const store = useHostStore();
  const remove = useOperation(
    (variables: string, signal) => workflows.remove(variables, { signal }),
    (_result, variables) => store.forget(variables),
  );
  const target = tryParseHostName(name)?.name;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-xl flex-col gap-5">
        <NameField name={name} onNameChange={onNameChange} />
        <Callout tone="warning" title="Deleting a host cannot be undone">
          A host that a domain still uses as a name server cannot be deleted.
        </Callout>
        {target ? (
          <div>
            <ConfirmAction
              destructive
              trigger="Delete this host"
              title={`Delete ${target}?`}
              confirmLabel={`Delete ${target}`}
              expected={target}
              pending={remove.pending}
              onConfirm={() => remove.start(target)}
            >
              The registry is asked to delete <code>{target}</code>. Only the sponsoring registrar may do this.
            </ConfirmAction>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Enter the name of the host to delete.</p>
        )}
      </div>
      <OperationOutcome operation={remove} success={`Deleted ${remove.variables ?? "the host"}`} />
    </div>
  );
}
