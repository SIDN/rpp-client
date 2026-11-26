import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import { useHostWorkflows } from "./hostHooks";
import { NameField, type PanelProps } from "./parts";

export function CheckPanel({ name, onNameChange, onCreate }: PanelProps & { onCreate(): void }) {
  const workflows = useHostWorkflows();
  const check = useOperation(
    async (variables: string, signal) => {
      const { available, details, meta } = await workflows.check(variables, { signal });
      return { data: { available, reason: details?.reason }, meta };
    },
    undefined,
    { keep: "hosts/check.check" },
  );

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
          <SubmitButton pending={check.pending}>{t("hosts.check.submit")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={check} success={t("hosts.check.success")}>
        {({ available, reason }) => (
          <div className="flex flex-col items-start gap-3">
            <p className="flex flex-wrap items-center gap-3 text-lg">
              <code>{check.variables?.trim()}</code>
              <Badge tone={available ? "success" : "danger"} dot>
                {available ? t("hosts.check.available") : t("hosts.check.notAvailable")}
              </Badge>
            </p>
            {reason && <p className="max-w-[62ch]">{reason}</p>}
            {available && (
              <Button variant="secondary" onClick={onCreate}>
                {t("hosts.check.createThisHost")}
              </Button>
            )}
          </div>
        )}
      </OperationOutcome>
    </div>
  );
}
