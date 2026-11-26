import { FormProvider, useForm, useWatch, type DeepPartial } from "react-hook-form";
import { buildDomainPatch, CLIENT_STATUSES, describePatchOperation, editOf, type AuthInfoEdit } from "@/application/domains/domainPatch";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import type { DomainName } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { useCachedDomain, useDomainStore } from "./domainCache";
import { DomainDetails } from "./DomainDetails";
import { DnsRecordFields } from "./DnsRecordFields";
import { recordInputOf, recordRowOf, type DnsRecordRow, type DnsRecordValues } from "./dnsRecordValues";
import { OperationOutcome } from "../shared/OperationOutcome";
import { DomainDataFields, NameField, type DomainDataValues, type PanelProps } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation, type Operation } from "../shared/useOperation";

interface ChangeValues extends DomainDataValues, DnsRecordValues {
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
  return {
    registrant: edit.registrant,
    contacts: edit.contacts,
    nameservers: edit.nameservers.map((host) => ({ host })),
    clientStatuses: edit.clientStatuses,
    authAction: "keep",
    authValue: "",
    dnsRecords: edit.records.map(recordRowOf),
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
    // A row with a problem (an emptied one too) adds nothing, so the record it held is removed; the form flags real problems.
    records: (values.dnsRecords ?? []).filter((row): row is DnsRecordRow => Boolean(row?.type)).map((row) =>
      recordInputOf({ type: row.type, name: row.name ?? "", value: row.value ?? "", preference: row.preference ?? "" }),
    ),
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
          Change <code>{domain.name}</code>
        </h3>
        <DomainDataFields />
        <DnsRecordFields domain={domain.name} />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">Locks set by you</legend>
          {CLIENT_STATUSES.map((label) => (
            <Choice key={label} type="checkbox" value={label} label={<code>{label}</code>} {...form.register("clientStatuses")} />
          ))}
          <p className="text-sm text-muted-foreground">Statuses the registry sets itself cannot be changed here.</p>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">Transfer password</legend>
          <Choice type="radio" value="keep" label="Leave as it is" {...form.register("authAction")} />
          <Choice type="radio" value="set" label="Set a new one" {...form.register("authAction")} />
          <Choice type="radio" value="remove" label="Remove it" {...form.register("authAction")} />
          {values.authAction === "set" && (
            <Field label="New transfer password">
              {(control) => <Input {...control} type="password" autoComplete="off" className="max-w-64" {...form.register("authValue")} />}
            </Field>
          )}
        </fieldset>

        <section aria-label="Changes to send" className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h4 className="font-semibold">Changes to send</h4>
          {operations.length === 0 ? (
            <p className="text-muted-foreground">Nothing has been changed yet.</p>
          ) : (
            <ul className="list-disc pl-5">
              {operations.map((operation, index) => (
                <li key={index}>{describePatchOperation(operation)}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            Only these changes are sent, as one partial update that the registry carries out completely or not at all. DNSSEC records are not changed on this screen.
          </p>
        </section>

        <div>
          <SubmitButton pending={change.pending} disabled={operations.length === 0}>
            Save changes
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
        <p className="text-sm text-muted-foreground">What changes is worked out from what the registry holds now, so the domain is loaded first.</p>
        <div>
          <SubmitButton pending={load.pending}>{domain ? "Load again" : "Load the domain"}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={load} success="Loaded the current data" />

      {!domain && !load.pending && !load.failure && !load.cancelled && !load.result && (
        <Callout tone="info" title="Load the domain to change it">
          The form appears here with the registrant, contacts, name servers and DNS records as they are now.
        </Callout>
      )}
      {domain && <ChangeForm key={JSON.stringify(editOf(domain))} domain={domain} change={change} />}
      <OperationOutcome operation={change} success={`Changed ${change.variables?.name ?? "the domain"}`}>
        {(changed) => <DomainDetails domain={changed} />}
      </OperationOutcome>
    </div>
  );
}
