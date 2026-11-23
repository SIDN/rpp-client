import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import type { RestoreReportInput } from "@/application/domains/domainWorkflows";
import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import type { RestoreProcess } from "@/rpp/core/types/objects";
import { useDomainStore } from "./domainCache";
import { reportOf, validateReport, type RestoreReportValues } from "./formValues";
import { OperationOutcome } from "../shared/OperationOutcome";
import { NameField, type PanelProps } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";

type RestoreAction = "request" | "report" | "status";

interface RestoreValues extends RestoreReportValues {
  action: RestoreAction;
  withReport: boolean;
}

type RestoreCommand =
  | { kind: "request"; name: string; report?: RestoreReportInput }
  | { kind: "report"; name: string; report: RestoreReportInput }
  | { kind: "status"; name: string };

const DEFAULTS: RestoreValues = {
  action: "request",
  withReport: false,
  preData: "",
  postData: "",
  deleteTime: "",
  restoreTime: "",
  restoreReason: "",
  statement1: "",
  statement2: "",
  other: "",
};

function ReportFields() {
  const {
    register,
    formState: { errors },
  } = useFormContext<RestoreValues>();
  const text = (name: keyof RestoreReportValues, label: string, hint?: string, type = "text") => (
    <Field key={name} label={label} hint={hint} error={errors[name]?.message}>
      {(control) => (type === "textarea" ? <textarea {...control} rows={3} className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-surface-foreground" {...register(name)} /> : <Input {...control} type={type} {...register(name)} />)}
    </Field>
  );
  return (
    <fieldset className="flex flex-col gap-4 border-l-2 border-border pl-5">
      <legend className="mb-1 font-medium">Restore report</legend>
      {text("preData", "Registration data before the delete", "The data of the domain as it was before it was deleted.", "textarea")}
      {text("postData", "Registration data after the restore", "The data the domain has now.", "textarea")}
      {text("deleteTime", "Deleted at", "In your time zone.", "datetime-local")}
      {text("restoreTime", "Restore asked at", "In your time zone.", "datetime-local")}
      {text("restoreReason", "Reason for the restore", undefined, "textarea")}
      {text("statement1", "First statement", "RFC 3915 asks the registrar for two statements. They are yours to make.", "textarea")}
      {text("statement2", "Second statement", undefined, "textarea")}
      {text("other", "Anything else (optional)", undefined, "textarea")}
    </fieldset>
  );
}

const STATUS_TONE = { restored: "success", pendingRestore: "warning", rgpPendingDelete: "danger" } as const;

function RestoreResult({ process }: { process: RestoreProcess }) {
  const tone = (STATUS_TONE as Record<string, "success" | "warning" | "danger">)[process.restoreStatus] ?? "neutral";
  const when = (value: string | undefined) => (value ? <code>{value}</code> : <Nothing>Not given</Nothing>);
  return (
    <DefinitionList>
      <DefinitionRow term="Restore status">
        <Badge tone={tone} dot>
          <code>{process.restoreStatus}</code>
        </Badge>
      </DefinitionRow>
      <DefinitionRow term="Requested">{when(process.requestDate)}</DefinitionRow>
      <DefinitionRow term="Report received">{when(process.reportDate)}</DefinitionRow>
      <DefinitionRow term="Report due by">{when(process.reportDueDate)}</DefinitionRow>
    </DefinitionList>
  );
}

export function RestorePanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const form = useForm<RestoreValues>({ defaultValues: DEFAULTS });
  const action = useWatch({ control: form.control, name: "action" });
  const withReport = useWatch({ control: form.control, name: "withReport" });

  const restore = useOperation(
    (command: RestoreCommand, signal) => {
      switch (command.kind) {
        case "request":
          return workflows.restore.request(command.name, command.report, { signal });
        case "report":
          return workflows.restore.report(command.name, command.report, { signal });
        case "status":
          return workflows.restore.status(command.name, { signal });
      }
    },
    (_result, command) => {
      if (command.kind !== "status") store.forget(command.name);
    },
  );

  const submit = form.handleSubmit((values) => {
    if (values.action === "status") return restore.start({ kind: "status", name });
    if (values.action === "request" && !values.withReport) return restore.start({ kind: "request", name });
    const problems = validateReport(values);
    form.clearErrors();
    for (const [field, message] of Object.entries(problems)) form.setError(field as keyof RestoreReportValues, { message });
    if (Object.keys(problems).length > 0) return;
    const report = reportOf(values);
    restore.start(values.action === "request" ? { kind: "request", name, report } : { kind: "report", name, report });
  });

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
          <NameField name={name} onNameChange={onNameChange} />
          <Callout tone="info" title="A domain can be restored while it is in its redemption period">
            Restoring takes two steps at most registries: ask for the restore, then send a report that says why. Check the status to see which step is next.
          </Callout>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-medium">What to do</legend>
            <Choice type="radio" value="request" label="Ask for the domain to be restored" {...form.register("action")} />
            <Choice type="radio" value="report" label="Send the restore report" hint="For a restore that is waiting for its report." {...form.register("action")} />
            <Choice type="radio" value="status" label="Check the restore status" {...form.register("action")} />
          </fieldset>
          {action === "request" && (
            <Choice type="checkbox" label="Send the report with the request" hint="Only if the registry takes the report in the same request." {...form.register("withReport")} />
          )}
          {(action === "report" || (action === "request" && withReport)) && <ReportFields />}
          <div>
            <SubmitButton pending={restore.pending}>
              {action === "request" ? "Ask for a restore" : action === "report" ? "Send the report" : "Check the status"}
            </SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome operation={restore} success={restore.variables?.kind === "status" ? "The registry reported the restore status" : "The registry took the restore"}>
        {(process) => <RestoreResult process={process} />}
      </OperationOutcome>
    </div>
  );
}
