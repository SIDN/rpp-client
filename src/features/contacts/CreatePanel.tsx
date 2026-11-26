import { useState } from "react";
import { t } from "@/i18n";
import { FormProvider } from "react-hook-form";
import { dataOf } from "@/application/contacts/contactCard";
import { useDraftForm, usePrefill } from "../shared/drafts";
import { PrefillNote, ResetButton } from "../shared/DraftActions";
import { toData, toValues, EMPTY_VALUES, type ContactValues } from "./formValues";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import type { CreateContactInput } from "@/application/contacts/contactWorkflows";
import { useContactForm, useContactStore, useContactWorkflows, useLoadedContact } from "./contactHooks";
import { ContactDetails } from "./ContactDetails";
import { ContactFields } from "./ContactFields";
import { IdField, SchemaLoading, SchemaNote, type PanelProps } from "./parts";

type CreateValues = ContactValues & { authInfo: string };

const EMPTY: CreateValues = { ...EMPTY_VALUES, authInfo: "" };

const ADDRESSES = { both: "both", "card-only": "international", "localized-only": "localized" } as const;

export function CreatePanel({ id, onIdChange }: PanelProps) {
  const workflows = useContactWorkflows();
  const store = useContactStore();
  const draft = useDraftForm<CreateValues>("contacts/create", EMPTY);
  const { form } = draft;
  const shape = useContactForm();

  // A contact loaded in Info or Change fills the form in, as far as the schema shapes it; never its password.
  const loaded = useLoadedContact().contact;
  const source = loaded && shape.status === "ready" ? { id: loaded.id, values: { ...toValues(dataOf(loaded, shape.mode)), authInfo: "" } } : undefined;
  usePrefill(draft, source);
  const [authInfoShown, setAuthInfoShown] = useState(false);

  const create = useOperation(
    (input: CreateContactInput, signal) => workflows.create(input, { signal }),
    (result, input) => {
      if (result.data) store.remember(input.id, result.data);
    },
    { keep: "contacts/create.create" },
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
              <PrefillNote draft={draft} source={source} />
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
              <div className="flex flex-wrap gap-2">
                <SubmitButton pending={create.pending}>{t("contacts.create.submit")}</SubmitButton>
                <ResetButton draft={draft} to={EMPTY}>
                  {t("shared.form.clear")}
                </ResetButton>
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
