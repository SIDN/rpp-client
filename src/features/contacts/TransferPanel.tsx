import { FormProvider, useForm, useWatch } from "react-hook-form";
import { Choice } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import type { OperationSuccess } from "@/rpp/operations/types";
import { ConfirmAction } from "../shared/ConfirmAction";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { TransferResult } from "../shared/TransferResult";
import { useOperation } from "../shared/useOperation";
import { useContactStore, useContactWorkflows } from "./contactHooks";
import { IdField, type PanelProps } from "./parts";

type TransferAction = "request" | "status" | "cancel" | "approve" | "reject";

interface TransferValues {
  action: TransferAction;
  authInfo: string;
}

type TransferCommand = { kind: "request"; id: string; authInfo: string } | { kind: Exclude<TransferAction, "request">; id: string };

const SUCCESS: Record<TransferAction, string> = {
  request: "The registry took the transfer request",
  status: "The registry reported the transfer status",
  cancel: "The transfer request was withdrawn",
  approve: "The transfer was approved",
  reject: "The transfer was rejected",
};

export function TransferPanel({ id, onIdChange }: PanelProps) {
  const workflows = useContactWorkflows();
  const store = useContactStore();
  const form = useForm<TransferValues>({ defaultValues: { action: "request", authInfo: "" } });
  const action = useWatch({ control: form.control, name: "action" });
  const target = id.trim();

  const transfer = useOperation(
    (command: TransferCommand, signal): Promise<OperationSuccess<unknown>> => {
      switch (command.kind) {
        case "request":
          return workflows.transfer.request(command.id, { authInfo: command.authInfo }, { signal });
        case "status":
          return workflows.transfer.status(command.id, { signal });
        case "cancel":
          return workflows.transfer.cancel(command.id, { signal });
        case "approve":
          return workflows.transfer.approve(command.id, { signal });
        case "reject":
          return workflows.transfer.reject(command.id, { signal });
      }
    },
    (_result, command) => {
      if (command.kind !== "status") store.forget(command.id);
    },
  );

  const submit = form.handleSubmit((values) => {
    if (values.action === "request") {
      if (values.authInfo === "") return form.setError("authInfo", { message: "Enter the transfer password of the contact" });
      return transfer.start({ kind: "request", id, authInfo: values.authInfo });
    }
    if (values.action === "status") transfer.start({ kind: "status", id });
  });

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
          <IdField id={id} onIdChange={onIdChange} />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-medium">What to do</legend>
            <Choice type="radio" value="request" label="Ask for the contact to be transferred to you" hint="As the gaining registrar, with the transfer password." {...form.register("action")} />
            <Choice type="radio" value="status" label="Check the transfer status" {...form.register("action")} />
            <Choice type="radio" value="cancel" label="Withdraw your transfer request" hint="As the registrar that asked for it." {...form.register("action")} />
            <Choice type="radio" value="approve" label="Approve a transfer away from you" hint="As the sponsoring registrar." {...form.register("action")} />
            <Choice type="radio" value="reject" label="Reject a transfer away from you" hint="As the sponsoring registrar." {...form.register("action")} />
          </fieldset>

          {action === "request" && (
            <div className="border-l-2 border-border pl-5">
              <Field label="Transfer password" hint="Sent in the RPP-Authorization header, never in the body of the request." error={form.formState.errors.authInfo?.message}>
                {(control) => <Input {...control} type="password" autoComplete="off" className="max-w-64" {...form.register("authInfo")} />}
              </Field>
            </div>
          )}

          {(action === "request" || action === "status") && (
            <div>
              <SubmitButton pending={transfer.pending}>{action === "request" ? "Ask for the transfer" : "Check the status"}</SubmitButton>
            </div>
          )}
        </form>
      </FormProvider>

      {(action === "cancel" || action === "approve" || action === "reject") && (
        <ConfirmAction
          destructive={action !== "cancel"}
          trigger={action === "cancel" ? "Withdraw the request" : action === "approve" ? "Approve the transfer" : "Reject the transfer"}
          title={`${action === "cancel" ? "Withdraw the transfer request for" : action === "approve" ? "Approve the transfer of" : "Reject the transfer of"} ${target}?`}
          confirmLabel={action === "cancel" ? `Withdraw for ${target}` : action === "approve" ? `Approve for ${target}` : `Reject for ${target}`}
          pending={transfer.pending}
          onConfirm={() => transfer.start({ kind: action, id })}
        >
          {action === "approve"
            ? "The contact moves to the registrar that asked for it. This cannot be undone from here."
            : action === "reject"
              ? "The registrar that asked for the transfer is refused, and the contact stays with you."
              : "The transfer request is withdrawn and the contact stays where it is."}
        </ConfirmAction>
      )}

      <OperationOutcome operation={transfer} success={SUCCESS[transfer.variables?.kind ?? "status"]}>
        {(data) => <TransferResult data={data} />}
      </OperationOutcome>
    </div>
  );
}
