import { t } from "@/i18n";
import { TransferCodeInput } from "../shared/TransferCodeInput";
import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useDiscoveryState } from "@/app/discovery-context";
import { idnLgrsFor } from "@/application/capability";
import { tryParseDomainName } from "@/application/domains/domainWorkflows";
import { Field, Input, Select } from "@/components/ui/field";
import { useDomainStore } from "./domainCache";
import { DomainDetails } from "./DomainDetails";
import { DnssecFields, DNSSEC_DEFAULTS, dnssecOf, type DnssecValues } from "./DnssecFields";
import { domainDataOf, periodOf, type CloneSource } from "./formValues";
import { Callout } from "@/components/ui/callout";
import { OperationOutcome } from "../shared/OperationOutcome";
import { DomainDataFields, NameField, PeriodFields, type DomainDataValues, type PanelProps, type PeriodValues } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import type { RegisterInput } from "@/application/domains/domainWorkflows";

interface RegisterValues extends PeriodValues, DomainDataValues, DnssecValues {
  authInfo: string;
  uName: string;
  lgr: string;
}

export type RegisterClone = CloneSource<Partial<RegisterValues>>;

const DEFAULTS: RegisterValues = { periodValue: "", periodUnit: "y", registrant: "", contacts: [], nameservers: [], authInfo: "", uName: "", lgr: "", ...DNSSEC_DEFAULTS };

export function RegisterPanel({ name, onNameChange, clone }: PanelProps & { clone?: RegisterClone }) {
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

  const serial = clone?.serial;
  useEffect(() => {
    if (clone) form.reset({ ...DEFAULTS, lgr: form.getValues("lgr"), ...clone.values });
    // Only a new clone resets the form; edits made since must survive a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, form]);

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
      dnssec: dnssecOf(values),
      ...domainDataOf(values),
    });
  });

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
          {clone && (
            <Callout tone="info" title={t("domains.register.cloned", { name: clone.from })}>
              {t("domains.register.clonedDetail")}
            </Callout>
          )}
          <NameField name={name} onNameChange={onNameChange} />
          <Field
            label={t("domains.register.unicodeName")}
            hint={idnOffered ? t("domains.register.unicodeHint") : t("domains.register.disabledIdn")}
          >
            {(control) => <Input {...control} disabled={!idnOffered} autoComplete="off" spellCheck={false} className="font-mono" {...form.register("uName")} />}
          </Field>
          <Field
            label={t("domains.register.lgr")}
            hint={idnOffered ? t("domains.register.lgrHint") : t("domains.register.disabledIdn")}
          >
            {(control) => (
              <Select {...control} disabled={!idnOffered} className="max-w-64" {...form.register("lgr")}>
                {!defaultLgr && <option value="">{t("domains.register.chooseRuleset")}</option>}
                {lgrs.map((lgr) => (
                  <option key={lgr.name} value={lgr.name}>
                    {lgr.name}
                    {lgr.isDefault ? t("domains.register.default") : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <PeriodFields label={t("domains.register.period")} />
          <DomainDataFields />
          <DnssecFields />
          <Field label={t("domains.register.transferPassword")} hint={t("domains.register.transferPasswordHint")}>
            {(control) => <TransferCodeInput name="authInfo" control={control} />}
          </Field>
          <div>
            <SubmitButton pending={register.pending}>{t("domains.register.submit")}</SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome operation={register} success={t("domains.register.success", { name: register.variables?.name ?? t("domains.name.generic") })}>
        {(domain) => <DomainDetails domain={domain} />}
      </OperationOutcome>
    </div>
  );
}
