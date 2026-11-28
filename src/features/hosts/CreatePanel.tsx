import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { CloneSource } from "../domains/formValues";
import { t } from "@/i18n";
import { Callout } from "@/components/ui/callout";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import type { CreateHostInput } from "@/application/hosts/hostWorkflows";
import { useHostStore, useHostWorkflows } from "./hostHooks";
import { HostDetails } from "./HostDetails";
import { AddressFields, NameField, type AddressValues, type PanelProps } from "./parts";

export type CreateClone = CloneSource<AddressValues>;

export function CreatePanel({ name, onNameChange, clone }: PanelProps & { clone?: CreateClone }) {
  const workflows = useHostWorkflows();
  const store = useHostStore();
  const form = useForm<AddressValues>({ defaultValues: { addresses: [] } });

  const serial = clone?.serial;
  useEffect(() => {
    if (clone) form.reset(clone.values);
    // Only a new clone resets the form; edits made since must survive a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, form]);

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
          {clone && (
            <Callout tone="info" title={t("hosts.create.cloned", { name: clone.from })}>
              {t("hosts.create.clonedDetail")}
            </Callout>
          )}
          <NameField name={name} onNameChange={onNameChange} />
          <AddressFields hint={t("hosts.create.addressesHint")} />
          <Callout tone="info" title={t("hosts.create.requirementsVary")}>
            {t("hosts.create.requirementsDescription")}
          </Callout>
          <div>
            <SubmitButton pending={create.pending}>{t("hosts.create.submit")}</SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome operation={create} success={t("hosts.create.success", { host: create.variables?.name.trim() || "the host" })}>
        {(host) => <HostDetails host={host} />}
      </OperationOutcome>
    </div>
  );
}
