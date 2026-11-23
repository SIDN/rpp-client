import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useDiscoveryState } from "@/app/discovery-context";
import { idnLgrsFor } from "@/application/capability";
import { tryParseDomainName } from "@/application/domains/domainWorkflows";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select } from "@/components/ui/field";
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
  uName: string;
  lgr: string;
}

const DEFAULTS: RegisterValues = { periodValue: "", periodUnit: "y", registrant: "", contacts: [], nameservers: [], authInfo: "", uName: "", lgr: "" };

export function RegisterPanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const form = useForm<RegisterValues>({ defaultValues: DEFAULTS });
  const discovery = useDiscoveryState();
  const idnOffered = idnLgrsFor(discovery).length > 0;
  const forTld = idnLgrsFor(discovery, tryParseDomainName(name)?.name ?? name);
  const lgrs = forTld.length > 0 ? forTld : idnLgrsFor(discovery);
  const defaultLgr = lgrs.find((lgr) => lgr.isDefault)?.name ?? (lgrs.length === 1 ? lgrs[0]?.name : undefined);

  useEffect(() => {
    if (defaultLgr && !form.getValues("lgr")) form.setValue("lgr", defaultLgr);
  }, [defaultLgr, form]);

  const register = useOperation(
    (input: RegisterInput, signal) => workflows.register(input, { signal }),
    (result, input) => {
      if (result.data) store.remember(input.name, result.data);
    },
  );

  const submit = form.handleSubmit((values) => {
    register.start({
      name,
      uName: values.uName.trim() || undefined,
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
          <Field
            label="Unicode name"
            hint={idnOffered ? "The Unicode form of the name, for an internationalized domain name." : "Disabled: the discovery document of the server lists no IDN rulesets."}
          >
            {(control) => <Input {...control} disabled={!idnOffered} autoComplete="off" spellCheck={false} className="font-mono" {...form.register("uName")} />}
          </Field>
          <Field
            label="Label Generation Ruleset"
            hint={idnOffered ? "The ruleset the Unicode name follows, from the discovery document." : "Disabled: the discovery document of the server lists no IDN rulesets."}
          >
            {(control) => (
              <Select {...control} disabled={!idnOffered} className="max-w-64" {...form.register("lgr")}>
                {!defaultLgr && <option value="">Choose a ruleset</option>}
                {lgrs.map((lgr) => (
                  <option key={lgr.name} value={lgr.name}>
                    {lgr.name}
                    {lgr.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
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
