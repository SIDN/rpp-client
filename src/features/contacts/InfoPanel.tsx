import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { Choice } from "@/components/ui/choice";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import { useContactStore, useContactWorkflows } from "./contactHooks";
import { ContactDetails } from "./ContactDetails";
import { IdField, type PanelProps } from "./parts";

/** `startNow` asks for the info of the identifier as soon as the panel is shown, as when a link leads here. */
export function InfoPanel({ id, onIdChange, startNow = false }: PanelProps & { startNow?: boolean }) {
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
          label="Include the transfer password"
          hint="Only the sponsoring registrar is given it, and only if the registry can show it."
          {...register("authInfo")}
        />
        <div>
          <SubmitButton pending={info.pending}>Get info</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={info} success={`Found ${info.variables?.id.trim() || "the contact"}`}>
        {(contact) => <ContactDetails contact={contact} />}
      </OperationOutcome>
    </div>
  );
}
