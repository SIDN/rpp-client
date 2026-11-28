import { useEffect } from "react";
import { TransferCodeInput } from "../shared/TransferCodeInput";
import { t } from "@/i18n";
import { FormProvider, useForm } from "react-hook-form";
import { toData, EMPTY_VALUES, type ContactValues } from "./formValues";
import type { CloneSource } from "../domains/formValues";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import type { CreateContactInput } from "@/application/contacts/contactWorkflows";
import { useContactForm, useContactStore, useContactWorkflows } from "./contactHooks";
import { ContactDetails } from "./ContactDetails";
import { ContactFields } from "./ContactFields";
import { IdField, SchemaLoading, SchemaNote, type PanelProps } from "./parts";

type CreateValues = ContactValues & { authInfo: string };

export type CreateClone = CloneSource<ContactValues>;

const ADDRESSES = { both: "both", "card-only": "international", "localized-only": "localized" } as const;

export function CreatePanel({ id, onIdChange, clone }: PanelProps & { clone?: CreateClone }) {
  const workflows = useContactWorkflows();
  const store = useContactStore();
  const form = useForm<CreateValues>({ defaultValues: { ...EMPTY_VALUES, authInfo: "" } });
  const shape = useContactForm();

  const serial = clone?.serial;
  useEffect(() => {
    if (clone) form.reset({ ...EMPTY_VALUES, authInfo: "", ...clone.values });
    // Only a new clone resets the form; edits made since must survive a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, form]);

  const create = useOperation(
    (input: CreateContactInput, signal) => workflows.create(input, { signal }),
    (result, input) => {
      if (result.data) store.remember(input.id, result.data);
    },
  );

  const submit = form.handleSubmit((values) => {
    if (shape.status !== "ready") return;
    create.start({ id, data: toData(values), authInfo: shape.authInfo ? values.authInfo || undefined : undefined, mode: shape.mode });
  });

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-8">
          {clone && (
            <Callout tone="info" title={t("contacts.create.cloned", { id: clone.from })}>
              {t("contacts.create.clonedDetail")}
            </Callout>
          )}
          <IdField id={id} onIdChange={onIdChange} />
          {shape.status === "loading" ? (
            <SchemaLoading />
          ) : (
            <>
              <SchemaNote note={shape.note} />
              <ContactFields withKind addresses={ADDRESSES[shape.mode]} />
              {shape.authInfo && (
                <Field label={t("contacts.create.authInfo")} hint={t("contacts.create.authInfoHint")}>
                  {(control) => <TransferCodeInput name="authInfo" control={control} />}
                </Field>
              )}
              <Callout tone="info" title={t("contacts.create.requirementsVary")}>
                {t("contacts.create.requirementsDescription")}
              </Callout>
              <div>
                <SubmitButton pending={create.pending}>{t("contacts.create.submit")}</SubmitButton>
              </div>
            </>
          )}
        </form>
      </FormProvider>
      <OperationOutcome operation={create} success={t("contacts.create.success", { contact: create.variables?.id.trim() || "the contact" })}>
        {(contact) => <ContactDetails contact={contact} />}
      </OperationOutcome>
    </div>
  );
}
