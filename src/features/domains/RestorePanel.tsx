import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import type { RestoreReportInput } from "@/application/domains/domainWorkflows";
import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { Badge } from "@/components/ui/badge";
import { Choice } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import type { RestoreProcess } from "@/rpp/core/types/objects";
import { useDomainStore } from "./domainCache";
import { reportOf, validateReport, type RestoreReportValues } from "./formValues";
import { OperationOutcome } from "../shared/OperationOutcome";
import { NameField, type PanelProps } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { Timestamp } from "../shared/objectParts";
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

/** The report the registry took, as text: it is sent, so it is no longer there to edit. */
function SentReport({ report }: { report: RestoreReportInput }) {
  const text = (value: string | undefined) => (value ? <span className="whitespace-pre-wrap">{value}</span> : <Nothing>Not given</Nothing>);
  return (
    <section aria-label="Restore report sent" className="flex flex-col gap-2">
      <h3 className="font-medium">Restore report sent</h3>
      <DefinitionList>
        <DefinitionRow term="Registration data before the delete">{text(report.preData)}</DefinitionRow>
        <DefinitionRow term="Registration data after the restore">{text(report.postData)}</DefinitionRow>
        <DefinitionRow term="Deleted at">
          <Timestamp value={report.deleteTime} />
        </DefinitionRow>
        <DefinitionRow term="Restore asked at">
          <Timestamp value={report.restoreTime} />
        </DefinitionRow>
        <DefinitionRow term="Reason for the restore">{text(report.restoreReason)}</DefinitionRow>
        {report.statements.map((statement, index) => (
          <DefinitionRow key={index} term={index === 0 ? "First statement" : index === 1 ? "Second statement" : `Statement ${index + 1}`}>
            {text(statement)}
          </DefinitionRow>
        ))}
        {report.other && <DefinitionRow term="Anything else">{text(report.other)}</DefinitionRow>}
      </DefinitionList>
    </section>
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

  const sent = restore.variables?.kind === "status" ? undefined : restore.variables?.report;
  // A restore already taken for this domain is not asked for again.
  const requested = restore.result !== undefined && restore.variables?.kind === "request" && restore.variables.name === name;
  const showSent = sent !== undefined && restore.result !== undefined && (action === "report" || (action === "request" && withReport));

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
          <NameField name={name} onNameChange={onNameChange} />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-medium">What to do</legend>
            <Choice type="radio" value="request" label="Ask for the domain to be restored" {...form.register("action")} />
            <Choice type="radio" value="report" label="Send the restore report" hint="For a restore that is waiting for its report." {...form.register("action")} />
            <Choice type="radio" value="status" label="Check the restore status" {...form.register("action")} />
          </fieldset>
          {action === "request" && (
            <Choice type="checkbox" label="Send the report with the request" hint="Only if the registry takes the report in the same request." {...form.register("withReport")} />
          )}
          {showSent && <SentReport report={sent} />}
          {!showSent && (action === "report" || (action === "request" && withReport)) && <ReportFields />}
          {!showSent && (
            <div>
              <SubmitButton pending={restore.pending} disabled={action === "request" && requested}>
                {action === "request" ? "Ask for a restore" : action === "report" ? "Send the report" : "Check the status"}
              </SubmitButton>
            </div>
          )}
        </form>
      </FormProvider>
      <OperationOutcome operation={restore} success={restore.variables?.kind === "status" ? "The registry reported the restore status" : "The registry took the restore"}>
        {(process) => <RestoreResult process={process} />}
      </OperationOutcome>
    </div>
  );
}
