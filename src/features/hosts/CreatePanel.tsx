import { FormProvider } from "react-hook-form";
import { editOf } from "@/application/hosts/hostData";
import { useDraftForm, usePrefill } from "../shared/drafts";
import { PrefillNote, ResetButton } from "../shared/DraftActions";
import { t } from "@/i18n";
import { Callout } from "@/components/ui/callout";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import type { CreateHostInput } from "@/application/hosts/hostWorkflows";
import { useHostStore, useHostWorkflows, useLoadedHost } from "./hostHooks";
import { HostDetails } from "./HostDetails";
import { AddressFields, NameField, type AddressValues, type PanelProps } from "./parts";

const EMPTY: AddressValues = { addresses: [] };

export function CreatePanel({ name, onNameChange }: PanelProps) {
  const workflows = useHostWorkflows();
  const store = useHostStore();
  const draft = useDraftForm<AddressValues>("hosts/create", EMPTY);
  const { form } = draft;

  // A host loaded in Info or Change fills in the addresses.
  const loaded = useLoadedHost().host;
  const source = loaded && { id: loaded.hostName, values: { addresses: editOf(loaded).addresses.map((value) => ({ value })) } };
  usePrefill(draft, source);

  const create = useOperation(
    (input: CreateHostInput, signal) => workflows.create(input, { signal }),
    (result, input) => {
      if (result.data) store.remember(input.name, result.data);
    },
    { keep: "hosts/create.create" },
  );

  const submit = form.handleSubmit((values) => create.start({ name, addresses: values.addresses.map((entry) => entry.value) }));

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-8">
          <NameField name={name} onNameChange={onNameChange} />
          <PrefillNote draft={draft} source={source} />
          <AddressFields hint={t("hosts.create.addressesHint")} />
          <Callout tone="info" title={t("hosts.create.requirementsVary")}>
            {t("hosts.create.requirementsDescription")}
          </Callout>
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={create.pending}>{t("hosts.create.submit")}</SubmitButton>
            <ResetButton draft={draft} to={EMPTY}>
              {t("shared.form.clear")}
            </ResetButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome operation={create} success={t("hosts.create.success", { host: create.variables?.name.trim() || "the host" })}>
        {(host) => <HostDetails host={host} />}
      </OperationOutcome>
    </div>
  );
}
