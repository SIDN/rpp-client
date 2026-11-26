import { useState } from "react";
import { t } from "@/i18n";
import { FormProvider, useForm } from "react-hook-form";
import { toData, EMPTY_VALUES, type ContactValues } from "./formValues";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import type { CreateContactInput } from "@/application/contacts/contactWorkflows";
import { useContactForm, useContactStore, useContactWorkflows } from "./contactHooks";
import { ContactDetails } from "./ContactDetails";
import { ContactFields } from "./ContactFields";
import { IdField, SchemaLoading, SchemaNote, type PanelProps } from "./parts";

type CreateValues = ContactValues & { authInfo: string };

const ADDRESSES = { both: "both", "card-only": "international", "localized-only": "localized" } as const;

export function CreatePanel({ id, onIdChange }: PanelProps) {
  const workflows = useContactWorkflows();
  const store = useContactStore();
  const form = useForm<CreateValues>({ defaultValues: { ...EMPTY_VALUES, authInfo: "" } });
  const shape = useContactForm();
  const [authInfoShown, setAuthInfoShown] = useState(false);

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
          <IdField id={id} onIdChange={onIdChange} />
          {shape.status === "loading" ? (
            <SchemaLoading />
          ) : (
            <>
              <SchemaNote note={shape.note} />
              <ContactFields withKind addresses={ADDRESSES[shape.mode]} />
              {shape.authInfo && (
                <Field label={t("contacts.create.authInfo")} hint={t("contacts.create.authInfoHint")}>
                  {(control) => (
                    <div className="flex items-center gap-2">
                      <Input {...control} type={authInfoShown ? "text" : "password"} autoComplete="off" className="max-w-64" {...form.register("authInfo")} />
                      <Button variant="ghost" size="sm" aria-pressed={authInfoShown} onClick={() => setAuthInfoShown((current) => !current)}>
                        {authInfoShown ? t("contacts.create.hide") : t("contacts.create.show")}
                      </Button>
                    </div>
                  )}
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
