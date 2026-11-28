import { useEffect, useRef } from "react";
import { t } from "@/i18n";
import { useForm } from "react-hook-form";
import { Choice } from "@/components/ui/choice";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import { useContactForm, useContactStore, useContactWorkflows } from "./contactHooks";
import { CloneAction } from "../shared/CloneAction";
import { dataOf } from "@/application/contacts/contactCard";
import type { Contact } from "@/rpp/core/types/objects";
import { toValues, type ContactValues } from "./formValues";
import { ContactDetails } from "./ContactDetails";
import { IdField, type PanelProps } from "./parts";

/** `startNow` asks for the info of the identifier as soon as the panel is shown, as when a link leads here. */
export function InfoPanel({ id, onIdChange, onClone, startNow = false }: PanelProps & { startNow?: boolean; onClone(contact: Contact, values: ContactValues): void }) {
  const shape = useContactForm();
  const workflows = useContactWorkflows();
  const store = useContactStore();
  const { register, handleSubmit } = useForm({ defaultValues: { authInfo: false } });
  const info = useOperation(
    (variables: { id: string; authInfo: boolean }, signal) => workflows.info(variables.id, { authInfo: variables.authInfo, signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.id, result.data);
    },
  );

  const started = useRef(false);
  const { start } = info;
  useEffect(() => {
    if (!startNow || started.current || id.trim() === "") return;
    started.current = true;
    start({ id, authInfo: false });
  }, [startNow, id, start]);

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit((values) => info.start({ id, authInfo: values.authInfo }))} className="flex max-w-xl flex-col gap-5">
        <IdField id={id} onIdChange={onIdChange} />
        <Choice
          type="checkbox"
          label={t("contacts.info.includeAuthInfo")}
          hint={t("contacts.info.includeAuthInfoHint")}
          {...register("authInfo")}
        />
        <div>
          <SubmitButton pending={info.pending}>{t("contacts.info.submit")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={info} success={t("contacts.info.success", { contact: info.variables?.id.trim() || "the contact" })}>
        {(contact) => (
          <div className="flex flex-col gap-6">
            <CloneAction
              disabled={shape.status !== "ready"}
              onClone={() => shape.status === "ready" && onClone(contact, toValues(dataOf(contact, shape.mode)))}
              hint={t("contacts.info.cloneHint")}
            />
            <ContactDetails contact={contact} />
          </div>
        )}
      </OperationOutcome>
    </div>
  );
}
