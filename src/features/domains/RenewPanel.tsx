import { t } from "@/i18n";
import { FormProvider, useForm } from "react-hook-form";
import type { PeriodInput } from "@/application/domains/domainWorkflows";
import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import type { RenewProcess } from "@/rpp/core/types/objects";
import { useCachedDomain, useDomainStore } from "./domainCache";
import { periodOf } from "./formValues";
import { OperationOutcome } from "../shared/OperationOutcome";
import { NameField, PeriodFields, type PanelProps, type PeriodValues } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";

interface RenewValues extends PeriodValues {
  sendExpiry: boolean;
}

interface Renewal {
  name: string;
  expiryDate?: string;
  period?: PeriodInput;
}

export function RenewPanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const known = useCachedDomain(name);
  const form = useForm<RenewValues>({ defaultValues: { periodValue: "", periodUnit: "y", sendExpiry: true } });
  const expiry = known?.expiryDate;

  const renew = useOperation(
    (renewal: Renewal, signal) => workflows.renew(renewal.name, { expiryDate: renewal.expiryDate, period: renewal.period }, { signal }),
    // The domain loaded before is out of date now.
    (_result, renewal) => store.forget(renewal.name),
  );

  const submit = form.handleSubmit((values) =>
    renew.start({ name, expiryDate: expiry && values.sendExpiry ? expiry : undefined, period: periodOf(values) }),
  );

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
          <NameField name={name} onNameChange={onNameChange} />
          <PeriodFields label={t("domains.renew.period")} />
          {expiry ? (
            <Choice
              type="checkbox"
              label={t("domains.renew.sendExpiry")}
              hint={<>{t("domains.renew.expiryHint")}<code>{expiry}</code>{t("domains.renew.expiryHintEnd")}</>}
              {...form.register("sendExpiry")}
            />
          ) : (
            <Callout tone="info" title={t("domains.renew.expiryUnknown")}>
              {t("domains.renew.lookupFirst")}
            </Callout>
          )}
          <div>
            <SubmitButton pending={renew.pending}>{t("domains.renew.submit")}</SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome operation={renew} success={t("domains.renew.success", { name: renew.variables?.name ?? t("domains.name.generic") })}>
        {(process) => <RenewResult process={process} />}
      </OperationOutcome>
    </div>
  );
}

function RenewResult({ process }: { process: RenewProcess }) {
  return (
    <DefinitionList>
      <DefinitionRow term={t("domains.renew.newExpiry")}>{process.expiryDate ? <code>{process.expiryDate}</code> : <Nothing>{t("domains.renew.notGiven")}</Nothing>}</DefinitionRow>
      {process.renewalPeriod && (
        <DefinitionRow term={t("domains.renew.periodResult")}>
          {process.renewalPeriod.value} {process.renewalPeriod.unit === "y" ? t("domains.renew.years") : process.renewalPeriod.unit === "m" ? t("domains.renew.months") : process.renewalPeriod.unit}
        </DefinitionRow>
      )}
    </DefinitionList>
  );
}
