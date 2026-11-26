import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import { useContactWorkflows } from "./contactHooks";
import { IdField, type PanelProps } from "./parts";

export function CheckPanel({ id, onIdChange, onCreate }: PanelProps & { onCreate(): void }) {
  const workflows = useContactWorkflows();
  const check = useOperation(
    async (variables: string, signal) => {
      const { available, details, meta } = await workflows.check(variables, { signal });
      return { data: { available, reason: details?.reason }, meta };
    },
    undefined,
    { keep: "contacts/check.check" },
  );

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          check.start(id);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <IdField id={id} onIdChange={onIdChange} />
        <div>
          <SubmitButton pending={check.pending}>{t("contacts.check.submit")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={check} success={t("contacts.check.success")}>
        {({ available, reason }) => (
          <div className="flex flex-col items-start gap-3">
            <p className="flex flex-wrap items-center gap-3 text-lg">
              <code>{check.variables?.trim()}</code>
              <Badge tone={available ? "success" : "danger"} dot>
                {available ? t("contacts.check.available") : t("contacts.check.notAvailable")}
              </Badge>
            </p>
            {reason && <p className="max-w-[62ch]">{reason}</p>}
            {available && (
              <Button variant="secondary" onClick={onCreate}>
                {t("contacts.check.createThisContact")}
              </Button>
            )}
          </div>
        )}
      </OperationOutcome>
    </div>
  );
}
