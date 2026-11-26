import { t } from "@/i18n";
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
    { keep: "domains/delete.remove" },
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
            trigger={t("domains.delete.trigger")}
            title={t("domains.delete.title", { name: target })}
            confirmLabel={t("domains.delete.confirm", { name: target })}
            expected={target}
            pending={remove.pending}
            onConfirm={() => remove.start(target)}
          >
            {t("domains.delete.explanation")}<code>{target}</code>{t("domains.delete.explanationEnd")}
          </ConfirmAction>
        </div>
      </div>
      <OperationOutcome operation={remove} success={t("domains.delete.success", { name: remove.variables ?? t("domains.name.generic") })} />
    </div>
  );
}
