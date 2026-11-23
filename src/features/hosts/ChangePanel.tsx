import { FormProvider, useForm, useWatch } from "react-hook-form";
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
import { useCachedHost, useHostStore, useHostWorkflows } from "./hostHooks";
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

function ChangeForm({ host, change }: { host: Host; change: Operation<Change, Host> }) {
  const form = useForm<ChangeValues>({ defaultValues: toValues(host) });
  const values = useWatch({ control: form.control });
  const operations = buildHostPatch(host, editOfValues(values as Partial<ChangeValues>));

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => change.start({ name: host.hostName, operations }))} noValidate className="flex max-w-xl flex-col gap-8">
        <h3>
          Change <code>{host.hostName}</code>
        </h3>

        <Field
          label="New host name"
          hint="Leave empty to keep the name. Renaming moves the host, with its addresses, to the new name."
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
                validate: (value) => value.trim() === "" || tryParseHostName(value) !== undefined || "This is not a name the protocol can take",
              })}
            />
          )}
        </Field>

        <AddressFields hint="The addresses of the host. Take one out to remove it; add one to give the host another." />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">Locks set by you</legend>
          {HOST_CLIENT_STATUSES.map((label) => (
            <Choice key={label} type="checkbox" value={label} label={<code>{label}</code>} {...form.register("clientStatuses")} />
          ))}
          <p className="text-sm text-muted-foreground">Statuses the registry sets itself cannot be changed here.</p>
        </fieldset>

        <section aria-label="Changes to send" className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h4 className="font-semibold">Changes to send</h4>
          {operations.length === 0 ? (
            <p className="text-muted-foreground">Nothing has been changed yet.</p>
          ) : (
            <ul className="list-disc pl-5">
              {operations.map((operation, index) => (
                <li key={index}>{describeHostOperation(operation)}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            Only these changes are sent, as one partial update that the registry carries out completely or not at all. The registry decides which of them it allows.
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
  const workflows = useHostWorkflows();
  const store = useHostStore();
  const host = useCachedHost(name);

  const load = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
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
        <p className="text-sm text-muted-foreground">What changes is worked out from what the registry holds now, so the host is loaded first.</p>
        <div>
          <SubmitButton pending={load.pending}>{host ? "Load again" : "Load the host"}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={load} success="Loaded the current data" />

      {!host && !load.pending && !load.failure && !load.cancelled && !load.result && (
        <Callout tone="info" title="Load the host to change it">
          The form appears here with the addresses and locks of the host as they are now.
        </Callout>
      )}
      {host && <ChangeForm key={JSON.stringify([host.hostName, editOf(host)])} host={host} change={change} />}
      <OperationOutcome operation={change} success={`Changed ${change.variables?.name ?? "the host"}`}>
        {(changed) => <HostDetails host={changed} />}
      </OperationOutcome>
    </div>
  );
}
