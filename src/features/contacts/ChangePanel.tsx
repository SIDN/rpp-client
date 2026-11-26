import { FormProvider, useForm, useWatch } from "react-hook-form";
import { t } from "@/i18n";
import { buildContactPatch, CONTACT_CLIENT_STATUSES, dataOf, describeContactOperation, editOf, type ContactEdit, type PostalMode } from "@/application/contacts/contactCard";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import type { Contact } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation, type Operation } from "../shared/useOperation";
import { useCachedContact, useContactForm, useContactStore, useContactWorkflows } from "./contactHooks";
import { ContactDetails } from "./ContactDetails";
import { ContactFields } from "./ContactFields";
import { addressTypeOfErrors, toData, toValues, type ContactValues } from "./formValues";
import { IdField, SchemaLoading, SchemaNote, type PanelProps } from "./parts";

const ADDRESSES = { both: "choose", "card-only": "international", "localized-only": "localized" } as const;

type ChangeValues = ContactValues & {
  clientStatuses: string[];
  authAction: "keep" | "set";
  authValue: string;
};

interface Change {
  id: string;
  operations: readonly PatchOperation[];
}

const toChangeValues = (contact: Contact, mode: PostalMode): ChangeValues => ({
  ...toValues(dataOf(contact, mode)),
  clientStatuses: editOf(contact, mode).clientStatuses,
  authAction: "keep",
  authValue: "",
});

function editOfValues(values: Partial<ChangeValues>): ContactEdit {
  return {
    ...toData(values),
    clientStatuses: (values.clientStatuses ?? []).filter((label): label is string => typeof label === "string"),
    authInfo: values.authAction === "set" && values.authValue ? { action: "set", value: values.authValue } : { action: "keep" },
  };
}

function ChangeForm({ contact, change, mode, authInfo, note }: { contact: Contact; change: Operation<Change, Contact>; mode: PostalMode; authInfo: boolean; note: string | undefined }) {
  const form = useForm<ChangeValues>({ defaultValues: toChangeValues(contact, mode) });
  const values = useWatch({ control: form.control });
  const operations = buildContactPatch(contact, editOfValues(values as Partial<ChangeValues>), mode);

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(
          () => change.start({ id: contact.id, operations }),
          (errors) => {
            const type = addressTypeOfErrors(errors);
            if (type) form.setValue("addressType", type);
          },
        )}
        noValidate
        className="flex max-w-xl flex-col gap-8"
      >
        <h3>
          {t("contacts.change.heading")} <code>{contact.id}</code>
        </h3>
        <SchemaNote note={note} />
        <ContactFields addresses={ADDRESSES[mode]} />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">{t("contacts.change.locksTitle")}</legend>
          {CONTACT_CLIENT_STATUSES.map((label) => (
            <Choice key={label} type="checkbox" value={label} label={<code>{label}</code>} {...form.register("clientStatuses")} />
          ))}
          <p className="text-sm text-muted-foreground">{t("contacts.change.locksDescription")}</p>
        </fieldset>

        {authInfo && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">{t("contacts.change.transferPassword")}</legend>
            <Choice type="radio" value="keep" label={t("contacts.change.authInfoKeep")} {...form.register("authAction")} />
            <Choice type="radio" value="set" label={t("contacts.change.authInfoSet")} {...form.register("authAction")} />
            {values.authAction === "set" && (
              <Field label={t("contacts.change.newAuthInfo")} hint={t("contacts.change.newAuthInfoHint")}>
                {(control) => <Input {...control} type="password" autoComplete="off" className="max-w-64" {...form.register("authValue")} />}
              </Field>
            )}
          </fieldset>
        )}

        <section aria-label={t("contacts.change.changesLabel")} className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h4 className="font-semibold">{t("contacts.change.changesTitle")}</h4>
          {operations.length === 0 ? (
            <p className="text-muted-foreground">{t("contacts.change.nothingChanged")}</p>
          ) : (
            <ul className="list-disc pl-5">
              {operations.map((operation, index) => (
                <li key={index}>{describeContactOperation(operation)}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            {t("contacts.change.changesDescription")}
          </p>
        </section>

        <div>
          <SubmitButton pending={change.pending} disabled={operations.length === 0}>
            {t("contacts.change.submit")}
          </SubmitButton>
        </div>
      </form>
    </FormProvider>
  );
}

export function ChangePanel({ id, onIdChange }: PanelProps) {
  const workflows = useContactWorkflows();
  const store = useContactStore();
  const contact = useCachedContact(id);
  const shape = useContactForm();
  const mode = shape.status === "ready" ? shape.mode : "both";

  const load = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );
  // Held here, not in the form: the form starts over when the saved contact replaces the loaded one.
  const change = useOperation(
    (variables: Change, signal) => workflows.change(variables.id, variables.operations, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.id, result.data);
      else store.forget(variables.id);
    },
  );

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          load.start(id);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <IdField id={id} onIdChange={onIdChange} />
        <p className="text-sm text-muted-foreground">{t("contacts.change.loadDescription")}</p>
        <div>
          <SubmitButton pending={load.pending}>{contact ? t("contacts.change.loadAgain") : t("contacts.change.loadContact")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={load} success={t("contacts.change.loadedSuccess")} />

      {!contact && !load.pending && !load.failure && !load.cancelled && !load.result && (
        <Callout tone="info" title={t("contacts.change.loadPromptTitle")}>
          {t("contacts.change.loadPromptDescription")}
        </Callout>
      )}
      {contact && shape.status === "loading" && <SchemaLoading />}
      {contact && shape.status === "ready" && (
        <ChangeForm key={`${mode}${shape.authInfo}${JSON.stringify(editOf(contact, mode))}`} contact={contact} change={change} mode={mode} authInfo={shape.authInfo} note={shape.note} />
      )}
      <OperationOutcome operation={change} success={t("contacts.change.success", { contact: change.variables?.id ?? "the contact" })}>
        {(changed) => <ContactDetails contact={changed} />}
      </OperationOutcome>
    </div>
  );
}
