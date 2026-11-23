import { FormProvider, useForm } from "react-hook-form";
import { toData, EMPTY_VALUES, type ContactValues } from "./formValues";
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
                <Field label="Transfer password" hint="Set now, or later in Change. Another registrar needs it to take the contact over.">
                  {(control) => <Input {...control} type="password" autoComplete="off" className="max-w-64" {...form.register("authInfo")} />}
                </Field>
              )}
              <Callout tone="info" title="What the registry requires varies">
                Most registries need a name, an address with a country, and an email address. If one is missing, the registry says which.
              </Callout>
              <div>
                <SubmitButton pending={create.pending}>Create contact</SubmitButton>
              </div>
            </>
          )}
        </form>
      </FormProvider>
      <OperationOutcome operation={create} success={`Created ${create.variables?.id.trim() || "the contact"}`}>
        {(contact) => <ContactDetails contact={contact} />}
      </OperationOutcome>
    </div>
  );
}
