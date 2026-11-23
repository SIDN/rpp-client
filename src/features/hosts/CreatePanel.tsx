import { FormProvider, useForm } from "react-hook-form";
import { Callout } from "@/components/ui/callout";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import type { CreateHostInput } from "@/application/hosts/hostWorkflows";
import { useHostStore, useHostWorkflows } from "./hostHooks";
import { HostDetails } from "./HostDetails";
import { AddressFields, NameField, type AddressValues, type PanelProps } from "./parts";

export function CreatePanel({ name, onNameChange }: PanelProps) {
  const workflows = useHostWorkflows();
  const store = useHostStore();
  const form = useForm<AddressValues>({ defaultValues: { addresses: [] } });

  const create = useOperation(
    (input: CreateHostInput, signal) => workflows.create(input, { signal }),
    (result, input) => {
      if (result.data) store.remember(input.name, result.data);
    },
  );

  const submit = form.handleSubmit((values) => create.start({ name, addresses: values.addresses.map((entry) => entry.value) }));

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-8">
          <NameField name={name} onNameChange={onNameChange} />
          <AddressFields hint="Give the addresses of a host below a domain of this registry. A host elsewhere has none." />
          <Callout tone="info" title="What the registry requires varies">
            Many registries accept addresses only for a host below a domain they hold, and refuse them for any other. If one is refused, the registry says which.
          </Callout>
          <div>
            <SubmitButton pending={create.pending}>Create host</SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome operation={create} success={`Created ${create.variables?.name.trim() || "the host"}`}>
        {(host) => <HostDetails host={host} />}
      </OperationOutcome>
    </div>
  );
}
