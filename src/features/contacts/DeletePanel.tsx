import { Callout } from "@/components/ui/callout";
import { t } from "@/i18n";
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
        <Callout tone="warning" title={t("contacts.delete.warningTitle")}>
          {t("contacts.delete.warningDescription")}
        </Callout>
        <div>
          <ConfirmAction
            destructive
            disabled={target === ""}
            trigger={t("contacts.delete.trigger")}
            title={t("contacts.delete.confirmTitle", { target })}
            confirmLabel={t("contacts.delete.confirmLabel", { target })}
            expected={target}
            pending={remove.pending}
            onConfirm={() => remove.start(target)}
          >
            <>{t("contacts.delete.confirmPrefix")} <code>{target}</code>{t("contacts.delete.confirmSuffix")}</>
          </ConfirmAction>
        </div>
      </div>
      <OperationOutcome operation={remove} success={t("contacts.delete.success", { contact: remove.variables ?? "the contact" })} />
    </div>
  );
}
