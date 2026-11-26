import { FormProvider, useWatch } from "react-hook-form";
import { useDraftForm } from "../shared/drafts";
import { ResetButton } from "../shared/DraftActions";
import { t } from "@/i18n";
import { buildHostPatch, describeHostOperation, editOf, HOST_CLIENT_STATUSES, type HostEdit } from "@/application/hosts/hostData";
import { tryParseHostName } from "@/application/hosts/hostWorkflows";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import type { Host } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation, type Operation } from "../shared/useOperation";
import { useCachedHost, useHostStore, useHostWorkflows, useLoadedHost } from "./hostHooks";
import { HostDetails } from "./HostDetails";
import { AddressFields, NameField, type AddressValues, type PanelProps } from "./parts";

interface ChangeValues extends AddressValues {
  newName: string;
  clientStatuses: string[];
}

interface Change {
  name: string;
  operations: readonly PatchOperation[];
}

const toValues = (host: Host): ChangeValues => {
  const edit = editOf(host);
  return { newName: "", addresses: edit.addresses.map((value) => ({ value })), clientStatuses: edit.clientStatuses };
};

const editOfValues = (values: Partial<ChangeValues>): HostEdit => ({
  newName: values.newName ?? "",
  addresses: (values.addresses ?? []).map((entry) => entry?.value ?? ""),
  clientStatuses: (values.clientStatuses ?? []).filter((label): label is string => typeof label === "string"),
});

/** `version` names the host as loaded: what was typed for another name or state of it is not given back. */
function ChangeForm({ host, version, change }: { host: Host; version: string; change: Operation<Change, Host> }) {
  const loaded = toValues(host);
  const draft = useDraftForm<ChangeValues>("hosts/change", loaded, version);
  const { form } = draft;
  const values = useWatch({ control: form.control });
  const operations = buildHostPatch(host, editOfValues(values as Partial<ChangeValues>));

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => change.start({ name: host.hostName, operations }))} noValidate className="flex max-w-xl flex-col gap-8">
        <h3>
          {t("hosts.change.heading")} <code>{host.hostName}</code>
        </h3>

        <Field
          label={t("hosts.change.newName")}
          hint={t("hosts.change.newNameHint")}
          error={form.formState.errors.newName?.message}
        >
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono"
              {...form.register("newName", {
                validate: (value) => value.trim() === "" || tryParseHostName(value) !== undefined || t("hosts.change.invalidName"),
              })}
            />
          )}
        </Field>

        <AddressFields hint={t("hosts.change.addressesHint")} />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">{t("hosts.change.locksTitle")}</legend>
          {HOST_CLIENT_STATUSES.map((label) => (
            <Choice key={label} type="checkbox" value={label} label={<code>{label}</code>} {...form.register("clientStatuses")} />
          ))}
          <p className="text-sm text-muted-foreground">{t("hosts.change.locksDescription")}</p>
        </fieldset>

        <section aria-label={t("hosts.change.changesLabel")} className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h4 className="font-semibold">{t("hosts.change.changesTitle")}</h4>
          {operations.length === 0 ? (
            <p className="text-muted-foreground">{t("hosts.change.nothingChanged")}</p>
          ) : (
            <ul className="list-disc pl-5">
              {operations.map((operation, index) => (
                <li key={index}>{describeHostOperation(operation)}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            {t("hosts.change.changesDescription")}
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={change.pending} disabled={operations.length === 0}>
            {t("hosts.change.submit")}
          </SubmitButton>
          <ResetButton draft={draft} to={loaded}>
            {t("shared.form.discard")}
          </ResetButton>
        </div>
      </form>
    </FormProvider>
  );
}

export function ChangePanel({ name, onNameChange }: PanelProps) {
  const workflows = useHostWorkflows();
  const store = useHostStore();
  const host = useCachedHost(name);
  const { setLoaded } = useLoadedHost();

  const load = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (!result.data) return;
      store.remember(variables, result.data);
      setLoaded(variables);
    },
    { keep: "hosts/change.load" },
  );
  // Held here, not in the form: the form starts over when the saved host replaces the loaded one.
  const change = useOperation(
    (variables: Change, signal) => workflows.change(variables.name, variables.operations, { signal }),
    (result, variables) => {
      const changed = result.data;
      if (changed) store.remember(changed.hostName, changed);
      const was = tryParseHostName(variables.name)?.name;
      const renamed = changed !== undefined && was !== undefined && was.toLowerCase() !== changed.hostName.toLowerCase();
      if (!changed || renamed) store.forget(variables.name);
      // The host is under its new name now; the screens follow it.
      if (changed && renamed) onNameChange(changed.hostName);
    },
    { keep: "hosts/change.change" },
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
        <p className="text-sm text-muted-foreground">{t("hosts.change.loadDescription")}</p>
        <div>
          <SubmitButton pending={load.pending}>{host ? t("hosts.change.loadAgain") : t("hosts.change.loadHost")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={load} success={t("hosts.change.loadedSuccess")} />

      {!host && !load.pending && !load.failure && !load.cancelled && !load.result && (
        <Callout tone="info" title={t("hosts.change.loadPromptTitle")}>
          {t("hosts.change.loadPromptDescription")}
        </Callout>
      )}
      {host && <ChangeForm key={JSON.stringify([host.hostName, editOf(host)])} version={JSON.stringify([host.hostName, editOf(host)])} host={host} change={change} />}
      <OperationOutcome operation={change} success={t("hosts.change.success", { host: change.variables?.name ?? "the host" })}>
        {(changed) => <HostDetails host={changed} />}
      </OperationOutcome>
    </div>
  );
}
