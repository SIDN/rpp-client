import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { t } from "@/i18n";
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
      <legend className="mb-1 font-medium">{t("domains.restore.reportLegend")}</legend>
      {text("preData", t("domains.restore.preData"), t("domains.restore.preDataHint"), "textarea")}
      {text("postData", t("domains.restore.postData"), t("domains.restore.postDataHint"), "textarea")}
      {text("deleteTime", t("domains.restore.deletedAt"), t("domains.restore.localTime"), "datetime-local")}
      {text("restoreTime", t("domains.restore.askedAt"), t("domains.restore.localTime"), "datetime-local")}
      {text("restoreReason", t("domains.restore.reason"), undefined, "textarea")}
      {text("statement1", t("domains.restore.firstStatement"), t("domains.restore.statementsHint"), "textarea")}
      {text("statement2", t("domains.restore.secondStatement"), undefined, "textarea")}
      {text("other", t("domains.restore.otherOptional"), undefined, "textarea")}
    </fieldset>
  );
}

/** The report the registry took, as text: it is sent, so it is no longer there to edit. */
function SentReport({ report }: { report: RestoreReportInput }) {
  const text = (value: string | undefined) => (value ? <span className="whitespace-pre-wrap">{value}</span> : <Nothing>{t("domains.restore.notGiven")}</Nothing>);
  return (
    <section aria-label={t("domains.restore.reportSentAria")} className="flex flex-col gap-2">
      <h3 className="font-medium">{t("domains.restore.reportSent")}</h3>
      <DefinitionList>
        <DefinitionRow term={t("domains.restore.preData")}>{text(report.preData)}</DefinitionRow>
        <DefinitionRow term={t("domains.restore.postData")}>{text(report.postData)}</DefinitionRow>
        <DefinitionRow term={t("domains.restore.deletedAt")}>
          <Timestamp value={report.deleteTime} />
        </DefinitionRow>
        <DefinitionRow term={t("domains.restore.askedAt")}>
          <Timestamp value={report.restoreTime} />
        </DefinitionRow>
        <DefinitionRow term={t("domains.restore.reason")}>{text(report.restoreReason)}</DefinitionRow>
        {report.statements.map((statement, index) => (
          <DefinitionRow key={index} term={index === 0 ? t("domains.restore.firstStatement") : index === 1 ? t("domains.restore.secondStatement") : t("domains.restore.statementNumber", { number: index + 1 })}>
            {text(statement)}
          </DefinitionRow>
        ))}
        {report.other && <DefinitionRow term={t("domains.restore.anythingElse")}>{text(report.other)}</DefinitionRow>}
      </DefinitionList>
    </section>
  );
}

const STATUS_TONE = { restored: "success", pendingRestore: "warning", rgpPendingDelete: "danger" } as const;

function RestoreResult({ process }: { process: RestoreProcess }) {
  const tone = (STATUS_TONE as Record<string, "success" | "warning" | "danger">)[process.restoreStatus] ?? "neutral";
  const when = (value: string | undefined) => (value ? <code>{value}</code> : <Nothing>{t("domains.restore.notGiven")}</Nothing>);
  return (
    <DefinitionList>
      <DefinitionRow term={t("domains.restore.status")}>
        <Badge tone={tone} dot>
          <code>{process.restoreStatus}</code>
        </Badge>
      </DefinitionRow>
      <DefinitionRow term={t("domains.restore.requested")}>{when(process.requestDate)}</DefinitionRow>
      <DefinitionRow term={t("domains.restore.reportReceived")}>{when(process.reportDate)}</DefinitionRow>
      <DefinitionRow term={t("domains.restore.reportDue")}>{when(process.reportDueDate)}</DefinitionRow>
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
            <legend className="mb-1 font-medium">{t("domains.restore.whatToDo")}</legend>
            <Choice type="radio" value="request" label={t("domains.restore.ask")} {...form.register("action")} />
            <Choice type="radio" value="report" label={t("domains.restore.sendReport")} hint={t("domains.restore.waitingHint")} {...form.register("action")} />
            <Choice type="radio" value="status" label={t("domains.restore.checkStatus")} {...form.register("action")} />
          </fieldset>
          {action === "request" && (
            <Choice type="checkbox" label={t("domains.restore.withReport")} hint={t("domains.restore.withReportHint")} {...form.register("withReport")} />
          )}
          {showSent && <SentReport report={sent} />}
          {!showSent && (action === "report" || (action === "request" && withReport)) && <ReportFields />}
          {!showSent && (
            <div>
              <SubmitButton pending={restore.pending} disabled={action === "request" && requested}>
                {action === "request" ? t("domains.restore.submitRequest") : action === "report" ? t("domains.restore.submitReport") : t("domains.restore.submitStatus")}
              </SubmitButton>
            </div>
          )}
        </form>
      </FormProvider>
      <OperationOutcome operation={restore} success={restore.variables?.kind === "status" ? t("domains.restore.statusSuccess") : t("domains.restore.requestSuccess")}>
        {(process) => <RestoreResult process={process} />}
      </OperationOutcome>
    </div>
  );
}
