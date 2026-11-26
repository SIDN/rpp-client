import { Callout } from "@/components/ui/callout";
import { t } from "@/i18n";
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
        <Callout tone="warning" title={t("hosts.delete.warningTitle")}>
          {t("hosts.delete.warningDescription")}
        </Callout>
        <div>
          <ConfirmAction
            destructive
            disabled={!target}
            trigger={t("hosts.delete.trigger")}
            title={t("hosts.delete.confirmTitle", { target: String(target) })}
            confirmLabel={t("hosts.delete.confirmLabel", { target: String(target) })}
            expected={target}
            pending={remove.pending}
            onConfirm={() => target && remove.start(target)}
          >
            <>{t("hosts.delete.confirmPrefix")} <code>{target}</code>{t("hosts.delete.confirmSuffix")}</>
          </ConfirmAction>
        </div>
      </div>
      <OperationOutcome operation={remove} success={t("hosts.delete.success", { host: remove.variables ?? "the host" })} />
    </div>
  );
}
