import { t } from "@/i18n";
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

function transferSuccess(action: TransferAction): string {
  switch (action) {
    case "request": return t("domains.transfer.requestSuccess");
    case "status": return t("domains.transfer.statusSuccess");
    case "cancel": return t("domains.transfer.cancelSuccess");
    case "approve": return t("domains.transfer.approveSuccess");
    case "reject": return t("domains.transfer.rejectSuccess");
  }
}

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
      if (values.authInfo === "") return form.setError("authInfo", { message: t("domains.validation.transferPassword") });
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
            <legend className="mb-1 font-medium">{t("domains.transfer.whatToDo")}</legend>
            <Choice type="radio" value="request" label={t("domains.transfer.ask")} hint={t("domains.transfer.gainingHint")} {...form.register("action")} />
            <Choice type="radio" value="status" label={t("domains.transfer.checkStatus")} {...form.register("action")} />
            <Choice type="radio" value="cancel" label={t("domains.transfer.withdraw")} hint={t("domains.transfer.requestingHint")} {...form.register("action")} />
            <Choice type="radio" value="approve" label={t("domains.transfer.approveAway")} hint={t("domains.transfer.sponsoringHint")} {...form.register("action")} />
            <Choice type="radio" value="reject" label={t("domains.transfer.rejectAway")} hint={t("domains.transfer.sponsoringHint")} {...form.register("action")} />
          </fieldset>

          {action === "request" && (
            <div className="flex flex-col gap-5 border-l-2 border-border pl-5">
              <Field label={t("domains.register.transferPassword")} hint={t("domains.transfer.passwordHint")} error={form.formState.errors.authInfo?.message}>
                {(control) => <Input {...control} type="password" autoComplete="off" className="max-w-64" {...form.register("authInfo")} />}
              </Field>
              <PeriodFields label={t("domains.transfer.renewBy")} />
            </div>
          )}

          {(action === "request" || action === "status") && (
            <div>
              <SubmitButton pending={transfer.pending}>{action === "request" ? t("domains.transfer.submitRequest") : t("domains.transfer.submitStatus")}</SubmitButton>
            </div>
          )}
        </form>
      </FormProvider>

      {(action === "cancel" || action === "approve" || action === "reject") && (
        <ConfirmAction
          destructive={action !== "cancel"}
          trigger={action === "cancel" ? t("domains.transfer.withdrawTrigger") : action === "approve" ? t("domains.transfer.approveTrigger") : t("domains.transfer.rejectTrigger")}
          title={action === "cancel" ? t("domains.transfer.withdrawTitle", { name: target }) : action === "approve" ? t("domains.transfer.approveTitle", { name: target }) : t("domains.transfer.rejectTitle", { name: target })}
          confirmLabel={action === "cancel" ? t("domains.transfer.withdrawConfirm", { name: target }) : action === "approve" ? t("domains.transfer.approveConfirm", { name: target }) : t("domains.transfer.rejectConfirm", { name: target })}
          pending={transfer.pending}
          onConfirm={() => transfer.start({ kind: action, name })}
        >
          {action === "approve"
            ? t("domains.transfer.approveExplanation")
            : action === "reject"
              ? t("domains.transfer.rejectExplanation")
              : t("domains.transfer.withdrawExplanation")}
        </ConfirmAction>
      )}

      <OperationOutcome operation={transfer} success={transferSuccess(transfer.variables?.kind ?? "status")}>
        {(data) => <TransferResult data={data} />}
      </OperationOutcome>
    </div>
  );
}
