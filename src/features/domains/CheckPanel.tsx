import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OperationOutcome } from "../shared/OperationOutcome";
import { NameField, type PanelProps } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";

export function CheckPanel({ name, onNameChange, onRegister }: PanelProps & { onRegister(): void }) {
  const workflows = useDomainWorkflows();
  const check = useOperation(async (variables: string, signal) => {
    const { available, details, meta } = await workflows.check(variables, { signal });
    return { data: { available, reason: details?.reason }, meta };
  });

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          check.start(name);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <NameField name={name} onNameChange={onNameChange} />
        <div>
          <SubmitButton pending={check.pending}>Check availability</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={check} success="The registry answered">
        {({ available, reason }) => (
          <div className="flex flex-col items-start gap-3">
            <p className="flex flex-wrap items-center gap-3 text-lg">
              <code>{check.variables}</code>
              <Badge tone={available ? "success" : "danger"} dot>
                {available ? "Available" : "Not available"}
              </Badge>
            </p>
            {reason && <p className="max-w-[62ch]">{reason}</p>}
            {available && (
              <Button variant="secondary" onClick={onRegister}>
                Register this name
              </Button>
            )}
          </div>
        )}
      </OperationOutcome>
    </div>
  );
}
