import { Callout } from "@/components/ui/callout";
import { ConfirmAction } from "../shared/ConfirmAction";
import { OperationOutcome } from "../shared/OperationOutcome";
import { useOperation } from "../shared/useOperation";
import { useContactStore, useContactWorkflows } from "./contactHooks";
import { IdField, type PanelProps } from "./parts";

export function DeletePanel({ id, onIdChange }: PanelProps) {
  const workflows = useContactWorkflows();
  const store = useContactStore();
  const remove = useOperation(
    (variables: string, signal) => workflows.remove(variables, { signal }),
    (_result, variables) => store.forget(variables),
  );
  const target = id.trim();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-xl flex-col gap-5">
        <IdField id={id} onIdChange={onIdChange} />
        <Callout tone="warning" title="Deleting a contact cannot be undone">
          A contact that a domain still uses cannot be deleted. Take it off the domain first.
        </Callout>
        {target !== "" ? (
          <div>
            <ConfirmAction
              destructive
              trigger="Delete this contact"
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
          <p className="text-sm text-muted-foreground">Enter the identifier of the contact to delete.</p>
        )}
      </div>
      <OperationOutcome operation={remove} success={`Deleted ${remove.variables ?? "the contact"}`} />
    </div>
  );
}
