import { FormProvider, useWatch } from "react-hook-form";
import { useDraftForm } from "../shared/drafts";
import { t } from "@/i18n";
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

function transferSuccess(action: TransferAction): string {
  switch (action) {
    case "request": return t("contacts.transfer.success.request");
    case "status": return t("contacts.transfer.success.status");
    case "cancel": return t("contacts.transfer.success.cancel");
    case "approve": return t("contacts.transfer.success.approve");
    case "reject": return t("contacts.transfer.success.reject");
  }
}

export function TransferPanel({ id, onIdChange }: PanelProps) {
  const workflows = useContactWorkflows();
  const store = useContactStore();
  const { form } = useDraftForm<TransferValues>("contacts/transfer", { action: "request", authInfo: "" });
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
    { keep: "contacts/transfer.transfer" },
  );

  const submit = form.handleSubmit((values) => {
    if (values.action === "request") {
      if (values.authInfo === "") return form.setError("authInfo", { message: t("contacts.transfer.authInfoRequired") });
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
            <legend className="mb-1 font-medium">{t("contacts.transfer.actionLegend")}</legend>
            <Choice type="radio" value="request" label={t("contacts.transfer.requestLabel")} hint={t("contacts.transfer.requestHint")} {...form.register("action")} />
            <Choice type="radio" value="status" label={t("contacts.transfer.statusLabel")} {...form.register("action")} />
            <Choice type="radio" value="cancel" label={t("contacts.transfer.cancelLabel")} hint={t("contacts.transfer.cancelHint")} {...form.register("action")} />
            <Choice type="radio" value="approve" label={t("contacts.transfer.approveLabel")} hint={t("contacts.transfer.sponsoringHint")} {...form.register("action")} />
            <Choice type="radio" value="reject" label={t("contacts.transfer.rejectLabel")} hint={t("contacts.transfer.sponsoringHint")} {...form.register("action")} />
          </fieldset>

          {action === "request" && (
            <div className="border-l-2 border-border pl-5">
              <Field label={t("contacts.transfer.authInfo")} hint={t("contacts.transfer.authInfoHint")} error={form.formState.errors.authInfo?.message}>
                {(control) => <Input {...control} type="password" autoComplete="off" className="max-w-64" {...form.register("authInfo")} />}
              </Field>
            </div>
          )}

          {(action === "request" || action === "status") && (
            <div>
              <SubmitButton pending={transfer.pending}>{action === "request" ? t("contacts.transfer.requestSubmit") : t("contacts.transfer.statusSubmit")}</SubmitButton>
            </div>
          )}
        </form>
      </FormProvider>

      {(action === "cancel" || action === "approve" || action === "reject") && (
        <ConfirmAction
          destructive={action !== "cancel"}
          trigger={action === "cancel" ? t("contacts.transfer.cancelTrigger") : action === "approve" ? t("contacts.transfer.approveTrigger") : t("contacts.transfer.rejectTrigger")}
          title={action === "cancel" ? t("contacts.transfer.cancelTitle", { target }) : action === "approve" ? t("contacts.transfer.approveTitle", { target }) : t("contacts.transfer.rejectTitle", { target })}
          confirmLabel={action === "cancel" ? t("contacts.transfer.cancelConfirm", { target }) : action === "approve" ? t("contacts.transfer.approveConfirm", { target }) : t("contacts.transfer.rejectConfirm", { target })}
          pending={transfer.pending}
          onConfirm={() => transfer.start({ kind: action, id })}
        >
          {action === "approve"
            ? t("contacts.transfer.approveDescription")
            : action === "reject"
              ? t("contacts.transfer.rejectDescription")
              : t("contacts.transfer.cancelDescription")}
        </ConfirmAction>
      )}

      <OperationOutcome operation={transfer} success={transferSuccess(transfer.variables?.kind ?? "status")}>
        {(data) => <TransferResult data={data} />}
      </OperationOutcome>
    </div>
  );
}
