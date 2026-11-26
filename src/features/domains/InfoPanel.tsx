import { t } from "@/i18n";
import { useForm } from "react-hook-form";
import { HOSTS_FILTERS, type HostsFilter } from "@/application/domains/domainWorkflows";
import { Choice } from "@/components/ui/choice";
import { Field, Select } from "@/components/ui/field";
import { useDomainStore } from "./domainCache";
import { DomainDetails } from "./DomainDetails";
import { OperationOutcome } from "../shared/OperationOutcome";
import { NameField, type PanelProps } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";

export function InfoPanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const { register, handleSubmit } = useForm<{ authInfo: boolean; hostsFilter: HostsFilter | "" }>({ defaultValues: { authInfo: false, hostsFilter: "" } });
  const info = useOperation(
    (variables: { name: string; authInfo: boolean; hostsFilter?: HostsFilter }, signal) =>
      workflows.info(variables.name, { authInfo: variables.authInfo, hostsFilter: variables.hostsFilter, signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.name, result.data);
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit((values) => info.start({ name, authInfo: values.authInfo, hostsFilter: values.hostsFilter || undefined }))} className="flex max-w-xl flex-col gap-5">
        <NameField name={name} onNameChange={onNameChange} />
        <Field label={t("domains.info.hostsFilter")} hint={t("domains.info.hostsFilterHint")}>
          {(control) => (
            <Select {...control} className="max-w-48" {...register("hostsFilter")}>
              <option value="">{t("domains.info.notSent")}</option>
              {HOSTS_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {filter}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Choice
          type="checkbox"
          label={t("domains.lookup.authInfoLabel")}
          hint={t("domains.lookup.authInfoHint")}
          {...register("authInfo")}
        />
        <div>
          <SubmitButton pending={info.pending}>{t("domains.info.submit")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={info} success={t("domains.info.success", { name: info.variables?.name ?? t("domains.name.generic") })}>
        {(domain) => <DomainDetails domain={domain} />}
      </OperationOutcome>
    </div>
  );
}
