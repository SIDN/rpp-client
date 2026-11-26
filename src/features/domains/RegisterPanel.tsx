import { t } from "@/i18n";
import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useDiscoveryState } from "@/app/discovery-context";
import { idnLgrsFor } from "@/application/capability";
import { tryParseDomainName } from "@/application/domains/domainWorkflows";
import { Field, Input, Select } from "@/components/ui/field";
import { useDomainStore } from "./domainCache";
import { DomainDetails } from "./DomainDetails";
import { DnsRecordFields } from "./DnsRecordFields";
import { DNS_RECORD_DEFAULTS, recordInputsOf, type DnsRecordValues } from "./dnsRecordValues";
import { DnssecFields, DNSSEC_DEFAULTS, dnssecOf, type DnssecValues } from "./DnssecFields";
import { domainDataOf, periodOf } from "./formValues";
import { OperationOutcome } from "../shared/OperationOutcome";
import { DomainDataFields, NameField, PeriodFields, type DomainDataValues, type PanelProps, type PeriodValues } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import type { RegisterInput } from "@/application/domains/domainWorkflows";
import { rriDomainMembers } from "@/application/extensions/denicRri/rriDomain";
import { RequestContactFields } from "../extensions/denicRri/RequestContactFields";
import { REQUEST_CONTACT_DEFAULTS, type RequestContactValues } from "../extensions/denicRri/formValues";
import { useDomainExtensions } from "./useDomainExtensions";

interface RegisterValues extends PeriodValues, DomainDataValues, DnssecValues, DnsRecordValues, RequestContactValues {
  authInfo: string;
  uName: string;
  lgr: string;
}

const DEFAULTS: RegisterValues = { periodValue: "", periodUnit: "y", registrant: "", contacts: [], nameservers: [], authInfo: "", uName: "", lgr: "", ...DNSSEC_DEFAULTS, ...DNS_RECORD_DEFAULTS, ...REQUEST_CONTACT_DEFAULTS };

export function RegisterPanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const form = useForm<RegisterValues>({ defaultValues: DEFAULTS });
  const discovery = useDiscoveryState();
  const extensions = useDomainExtensions();
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
      dnssec: dnssecOf(values),
      records: recordInputsOf(values.dnsRecords),
      ...domainDataOf(values),
      contactRoles: extensions.contactRoles,
      ...(extensions.rri && { extensionMembers: rriDomainMembers(values) }),
    });
  });

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
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
          <DnsRecordFields domain={tryParseDomainName(name)?.name ?? ""} />
          {extensions.rri && <RequestContactFields />}
          <DnssecFields />
          <Field label={t("domains.register.transferPassword")} hint={t("domains.register.transferPasswordHint")}>
            {(control) => <Input {...control} type="password" autoComplete="off" className="max-w-64" {...form.register("authInfo")} />}
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
