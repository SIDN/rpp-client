import { t } from "@/i18n";
import { useForm } from "react-hook-form";
import { Choice } from "@/components/ui/choice";
import { useDomainStore } from "./domainCache";
import { DomainDetails } from "./DomainDetails";
import { OperationOutcome } from "../shared/OperationOutcome";
import { NameField, type PanelProps } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";

export function LookupPanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const { register, handleSubmit } = useForm({ defaultValues: { authInfo: false } });
  const lookup = useOperation(
    (variables: { name: string; authInfo: boolean }, signal) => workflows.info(variables.name, { authInfo: variables.authInfo, signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.name, result.data);
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit((values) => lookup.start({ name, authInfo: values.authInfo }))} className="flex max-w-xl flex-col gap-5">
        <NameField name={name} onNameChange={onNameChange} />
        <Choice
          type="checkbox"
          label={t("domains.lookup.authInfoLabel")}
          hint={t("domains.lookup.authInfoHint")}
          {...register("authInfo")}
        />
        <div>
          <SubmitButton pending={lookup.pending}>{t("domains.lookup.submit")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={lookup} success={t("domains.lookup.success", { name: lookup.variables?.name ?? t("domains.name.generic") })}>
        {(domain) => <DomainDetails domain={domain} />}
      </OperationOutcome>
    </div>
  );
}
