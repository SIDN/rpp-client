import { FormProvider, useForm, useWatch } from "react-hook-form";
import { Choice } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import type { PeriodInput } from "@/application/domains/domainWorkflows";
import type { OperationSuccess } from "@/rpp/operations/types";
import { ConfirmAction } from "../shared/ConfirmAction";
import { useDomainStore } from "./domainCache";
import { periodOf } from "./formValues";
import { OperationOutcome } from "../shared/OperationOutcome";
import { TransferResult } from "../shared/TransferResult";
import { NameField, PeriodFields, type PanelProps, type PeriodValues } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";

type TransferAction = "request" | "status" | "cancel" | "approve" | "reject";

interface TransferValues extends PeriodValues {
  action: TransferAction;
  authInfo: string;
}

type TransferCommand = { kind: "request"; name: string; authInfo: string; period?: PeriodInput } | { kind: Exclude<TransferAction, "request">; name: string };

const SUCCESS: Record<TransferAction, string> = {
  request: "The registry took the transfer request",
  status: "The registry reported the transfer status",
  cancel: "The transfer request was withdrawn",
  approve: "The transfer was approved",
  reject: "The transfer was rejected",
};

export function TransferPanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const form = useForm<TransferValues>({ defaultValues: { action: "request", authInfo: "", periodValue: "", periodUnit: "y" } });
  const action = useWatch({ control: form.control, name: "action" });
  const target = name.trim();

  const transfer = useOperation(
    (command: TransferCommand, signal): Promise<OperationSuccess<unknown>> => {
      switch (command.kind) {
        case "request":
          return workflows.transfer.request(command.name, { authInfo: command.authInfo, period: command.period }, { signal });
        case "status":
          return workflows.transfer.status(command.name, { signal });
        case "cancel":
          return workflows.transfer.cancel(command.name, { signal });
        case "approve":
          return workflows.transfer.approve(command.name, { signal });
        case "reject":
          return workflows.transfer.reject(command.name, { signal });
      }
    },
    (_result, command) => {
      if (command.kind !== "status") store.forget(command.name);
    },
  );

  const submit = form.handleSubmit((values) => {
    if (values.action === "request") {
      if (values.authInfo === "") return form.setError("authInfo", { message: "Enter the transfer password of the domain" });
      return transfer.start({ kind: "request", name, authInfo: values.authInfo, period: periodOf(values) });
    }
    if (values.action === "status") transfer.start({ kind: "status", name });
  });

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
          <NameField name={name} onNameChange={onNameChange} />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-medium">What to do</legend>
            <Choice type="radio" value="request" label="Ask for the domain to be transferred to you" hint="As the gaining registrar, with the transfer password." {...form.register("action")} />
            <Choice type="radio" value="status" label="Check the transfer status" {...form.register("action")} />
            <Choice type="radio" value="cancel" label="Withdraw your transfer request" hint="As the registrar that asked for it." {...form.register("action")} />
            <Choice type="radio" value="approve" label="Approve a transfer away from you" hint="As the sponsoring registrar." {...form.register("action")} />
            <Choice type="radio" value="reject" label="Reject a transfer away from you" hint="As the sponsoring registrar." {...form.register("action")} />
          </fieldset>

          {action === "request" && (
            <div className="flex flex-col gap-5 border-l-2 border-border pl-5">
              <Field label="Transfer password" hint="Sent in the RPP-Authorization header, never in the body of the request." error={form.formState.errors.authInfo?.message}>
                {(control) => <Input {...control} type="password" autoComplete="off" className="max-w-64" {...form.register("authInfo")} />}
              </Field>
              <PeriodFields label="Renew by" />
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
          onConfirm={() => transfer.start({ kind: action, name })}
        >
          {action === "approve"
            ? "The domain moves to the registrar that asked for it. This cannot be undone from here."
            : action === "reject"
              ? "The registrar that asked for the transfer is refused, and the domain stays with you."
              : "The transfer request is withdrawn and the domain stays where it is."}
        </ConfirmAction>
      )}

      <OperationOutcome operation={transfer} success={SUCCESS[transfer.variables?.kind ?? "status"]}>
        {(data) => <TransferResult data={data} />}
      </OperationOutcome>
    </div>
  );
}
