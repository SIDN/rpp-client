import { FormProvider, useForm } from "react-hook-form";
import { tryParseDomainName } from "@/application/domains/domainWorkflows";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { useDomainStore } from "./domainCache";
import { DomainDetails } from "./DomainDetails";
import { domainDataOf, periodOf } from "./formValues";
import { OperationOutcome } from "../shared/OperationOutcome";
import { DomainDataFields, NameField, PeriodFields, type DomainDataValues, type PanelProps, type PeriodValues } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import type { RegisterInput } from "@/application/domains/domainWorkflows";

interface RegisterValues extends PeriodValues, DomainDataValues {
  authInfo: string;
  lgr: string;
}

const DEFAULTS: RegisterValues = { periodValue: "", periodUnit: "y", registrant: "", contacts: [], nameservers: [], authInfo: "", lgr: "" };

export function RegisterPanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const form = useForm<RegisterValues>({ defaultValues: DEFAULTS });
  const unicode = tryParseDomainName(name)?.unicode !== undefined;

  const register = useOperation(
    (input: RegisterInput, signal) => workflows.register(input, { signal }),
    (result, input) => {
      if (result.data) store.remember(input.name, result.data);
    },
  );

  const submit = form.handleSubmit((values) => {
    register.start({
      name,
      lgr: values.lgr.trim() || undefined,
      period: periodOf(values),
      authInfo: values.authInfo || undefined,
      ...domainDataOf(values),
    });
  });

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
          <NameField name={name} onNameChange={onNameChange} />
          {unicode && (
            <Field label="Label Generation Ruleset" hint="The registry needs the ruleset (LGR) that the Unicode name follows, for example nl.">
              {(control) => <Input {...control} spellCheck={false} className="max-w-48" {...form.register("lgr")} />}
            </Field>
          )}
          <PeriodFields label="Registration period" />
          <DomainDataFields />
          <Field label="Transfer password" hint="Set now, or later in Change. Another registrar needs it to take the domain over.">
            {(control) => <Input {...control} type="password" autoComplete="off" className="max-w-64" {...form.register("authInfo")} />}
          </Field>
          <Callout tone="info" title="Registering may be billed">
            The registry decides what a registration costs and when it is charged. Check that the name is available first.
          </Callout>
          <div>
            <SubmitButton pending={register.pending}>Register domain</SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome operation={register} success={`Registered ${register.variables?.name ?? "the domain"}`}>
        {(domain) => <DomainDetails domain={domain} />}
      </OperationOutcome>
    </div>
  );
}
