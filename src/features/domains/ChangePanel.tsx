import { t } from "@/i18n";
import { FormProvider, useForm, useWatch, type DeepPartial } from "react-hook-form";
import { buildDomainPatch, CLIENT_STATUSES, describePatchOperation, dnssecEditOf, editOf, type AuthInfoEdit } from "@/application/domains/domainPatch";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { DnssecFields, type DnssecValues } from "./DnssecFields";
import type { DomainName } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { useCachedDomain, useDomainStore } from "./domainCache";
import { DomainDetails } from "./DomainDetails";
import { OperationOutcome } from "../shared/OperationOutcome";
import { DomainDataFields, NameField, type DomainDataValues, type PanelProps } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation, type Operation } from "../shared/useOperation";

interface ChangeValues extends DomainDataValues, DnssecValues {
  clientStatuses: string[];
  authAction: "keep" | "set" | "remove";
  authValue: string;
}

interface Change {
  name: string;
  operations: readonly PatchOperation[];
}

const toValues = (domain: DomainName): ChangeValues => {
  const edit = editOf(domain);
  const dnssec = dnssecEditOf(domain);
  return {
    registrant: edit.registrant,
    contacts: edit.contacts,
    nameservers: edit.nameservers.map((host) => ({ host })),
    clientStatuses: edit.clientStatuses,
    authAction: "keep",
    authValue: "",
    dsRecords: dnssec.ds as unknown as DnssecValues["dsRecords"],
    keyRecords: dnssec.keys as unknown as DnssecValues["keyRecords"],
    maxSigLife: dnssec.maxSigLife,
  };
};

function editOfValues(values: DeepPartial<ChangeValues>) {
  const authInfo: AuthInfoEdit =
    values.authAction === "set" && values.authValue ? { action: "set", value: values.authValue } : values.authAction === "remove" ? { action: "remove" } : { action: "keep" };
  return {
    registrant: values.registrant ?? "",
    contacts: (values.contacts ?? []).map((contact) => ({ label: contact?.label ?? "", id: contact?.id ?? "" })),
    nameservers: (values.nameservers ?? []).map((server) => server?.host ?? ""),
    clientStatuses: (values.clientStatuses ?? []).filter((label): label is string => typeof label === "string"),
    authInfo,
    dnssec: {
      ds: (values.dsRecords ?? []).map((record) => ({ ...record }) as Record<string, string>),
      keys: (values.keyRecords ?? []).map((record) => ({ ...record }) as Record<string, string>),
      maxSigLife: values.maxSigLife ?? "",
    },
  };
}

function ChangeForm({ domain, change }: { domain: DomainName; change: Operation<Change, DomainName> }) {
  const form = useForm<ChangeValues>({ defaultValues: toValues(domain) });
  const values = useWatch({ control: form.control });
  const operations = buildDomainPatch(domain, editOfValues(values));

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => change.start({ name: domain.name, operations }))} noValidate className="flex max-w-xl flex-col gap-6">
        <h3>
          {t("domains.change.heading")} <code>{domain.name}</code>
        </h3>
        <DomainDataFields />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">{t("domains.change.locks")}</legend>
          {CLIENT_STATUSES.map((label) => (
            <Choice key={label} type="checkbox" value={label} label={<code>{label}</code>} {...form.register("clientStatuses")} />
          ))}
          <p className="text-sm text-muted-foreground">{t("domains.change.statusHint")}</p>
        </fieldset>

        <DnssecFields />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">{t("domains.change.transferPasswordLegend")}</legend>
          <Choice type="radio" value="keep" label={t("domains.change.leavePassword")} {...form.register("authAction")} />
          <Choice type="radio" value="set" label={t("domains.change.setPassword")} {...form.register("authAction")} />
          <Choice type="radio" value="remove" label={t("domains.change.removePassword")} {...form.register("authAction")} />
          {values.authAction === "set" && (
            <Field label={t("domains.change.newTransferPassword")}>
              {(control) => <Input {...control} type="password" autoComplete="off" className="max-w-64" {...form.register("authValue")} />}
            </Field>
          )}
        </fieldset>

        <section aria-label={t("domains.change.sendLabel")} className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h4 className="font-semibold">{t("domains.change.sendLabel")}</h4>
          {operations.length === 0 ? (
            <p className="text-muted-foreground">{t("domains.change.nothingChanged")}</p>
          ) : (
            <ul className="list-disc pl-5">
              {operations.map((operation, index) => (
                <li key={index}>{describePatchOperation(operation)}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            {t("domains.change.partialUpdate")}
          </p>
        </section>

        <div>
          <SubmitButton pending={change.pending} disabled={operations.length === 0}>
            {t("domains.change.save")}
          </SubmitButton>
        </div>
      </form>
    </FormProvider>
  );
}

export function ChangePanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const domain = useCachedDomain(name);

  const load = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );
  // Held here, not in the form: the form starts over when the saved domain replaces the loaded one.
  const change = useOperation(
    (variables: Change, signal) => workflows.change(variables.name, variables.operations, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.name, result.data);
      else store.forget(variables.name);
    },
  );

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          load.start(name);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <NameField name={name} onNameChange={onNameChange} />
        <p className="text-sm text-muted-foreground">{t("domains.change.loadExplanation")}</p>
        <div>
          <SubmitButton pending={load.pending}>{domain ? t("domains.change.loadAgain") : t("domains.change.loadDomain")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={load} success={t("domains.change.loaded")} />

      {!domain && !load.pending && !load.failure && !load.cancelled && !load.result && (
        <Callout tone="info" title={t("domains.change.loadCallout")}>
          {t("domains.change.loadHint")}
        </Callout>
      )}
      {domain && <ChangeForm key={JSON.stringify(editOf(domain))} domain={domain} change={change} />}
      <OperationOutcome operation={change} success={t("domains.change.success", { name: change.variables?.name ?? t("domains.name.generic") })}>
        {(changed) => <DomainDetails domain={changed} />}
      </OperationOutcome>
    </div>
  );
}
