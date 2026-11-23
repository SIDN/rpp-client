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
          <PeriodFields label="Renew for" />
          {expiry ? (
            <Choice
              type="checkbox"
              label="Send the current expiry date"
              hint={<>The registry refuses the renewal if the domain no longer expires on <code>{expiry}</code>, so it is not renewed twice.</>}
              {...form.register("sendExpiry")}
            />
          ) : (
            <Callout tone="info" title="The current expiry date is not known">
              Look the domain up first, and the renewal can carry its expiry date. The registry then refuses a renewal that was already done.
            </Callout>
          )}
          <div>
            <SubmitButton pending={renew.pending}>Renew domain</SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome operation={renew} success={`Renewed ${renew.variables?.name ?? "the domain"}`}>
        {(process) => <RenewResult process={process} />}
      </OperationOutcome>
    </div>
  );
}

function RenewResult({ process }: { process: RenewProcess }) {
  return (
    <DefinitionList>
      <DefinitionRow term="New expiry date">{process.expiryDate ? <code>{process.expiryDate}</code> : <Nothing>Not given</Nothing>}</DefinitionRow>
      {process.renewalPeriod && (
        <DefinitionRow term="Renewal period">
          {process.renewalPeriod.value} {process.renewalPeriod.unit === "y" ? "year(s)" : process.renewalPeriod.unit === "m" ? "month(s)" : process.renewalPeriod.unit}
        </DefinitionRow>
      )}
    </DefinitionList>
  );
}
