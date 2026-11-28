import { Fragment, type ReactNode } from "react";
import { Check, CornerDownRight } from "lucide-react";
import { t } from "@/i18n";
import { TRANSFER_MAIN_STAGES, TRANSFER_OUTCOME_STAGES, transferPositionOf, type TransferPosition, type TransferStage, type TransferStageState } from "@/application/transfers/transferFlow";
import { Callout } from "@/components/ui/callout";
import { cn } from "@/lib/utils";
import type { TransferProcess } from "@/rpp/core/types/objects";
import { Timestamp } from "./objectParts";

const TITLE: Record<TransferStage, string> = {
  requested: "shared.transferFlow.requested",
  awaitingDecision: "shared.transferFlow.awaitingDecision",
  transferred: "shared.transferFlow.transferred",
  rejected: "shared.transferFlow.rejected",
  cancelled: "shared.transferFlow.cancelled",
};

const STATE_LABEL: Record<Exclude<TransferStageState, "current">, string> = {
  passed: "shared.transferFlow.passed",
  skipped: "shared.transferFlow.skipped",
  ahead: "shared.transferFlow.ahead",
  closed: "shared.transferFlow.closed",
};

const NODE: Record<TransferStageState, string> = {
  current: "border-primary bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/25",
  passed: "border-border bg-surface",
  skipped: "border-dashed border-border bg-surface text-muted-foreground",
  ahead: "border-dashed border-border bg-surface text-muted-foreground",
  closed: "border-dashed border-border bg-muted/40 text-muted-foreground",
};

/** A line into a stage: drawn solid where the transfer went, dashed where it may still go. */
const lineInto = (state: TransferStageState) => (state === "passed" || state === "current" ? "border-primary" : "border-dashed border-border");

const push = (process: TransferProcess) => process.transferDir === "push";

function description(stage: TransferStage, process: TransferProcess): string {
  switch (stage) {
    case "requested":
      return process.transferDir === undefined
        ? t("shared.transferFlow.requestedDescription", {
            client: process.reqClientId,
          })
        : push(process)
          ? t("shared.transferFlow.requestedPushDescription", {
              client: process.reqClientId,
              gaining: process.gainingClientId ?? "?",
            })
          : t("shared.transferFlow.requestedPullDescription", {
              client: process.reqClientId,
            });
    case "awaitingDecision":
      return push(process) ? t("shared.transferFlow.awaitingDecisionPushDescription") : t("shared.transferFlow.awaitingDecisionPullDescription");
    case "transferred":
      return t("shared.transferFlow.transferredDescription");
    case "rejected":
      return t("shared.transferFlow.rejectedDescription");
    case "cancelled":
      return t("shared.transferFlow.cancelledDescription");
  }
}

/** What the current stage adds: who must act and by when while pending; who acted and when once it ended. */
function details(stage: TransferStage, position: TransferPosition, process: TransferProcess): ReactNode {
  if (stage === "requested") {
    return (
      <p className="text-xs [&_code]:text-current [&_code]:opacity-80">
        <Timestamp value={process.requestDate} />
      </p>
    );
  }
  if (!position.known || position.current !== stage) return null;
  if (stage === "awaitingDecision") {
    return (
      <>
        <p className="text-xs font-medium">{t("shared.transferFlow.waitingFor", { client: process.actClientId })}</p>
        <p className="text-xs font-medium [&_code]:text-current [&_code]:opacity-80">
          {t("shared.transferFlow.decisionDue")} <Timestamp value={process.actionDate} />
        </p>
      </>
    );
  }
  return (
    <>
      <p className="text-xs font-medium">
        {position.decidedBy === "server"
          ? t("shared.transferFlow.byRegistry")
          : t("shared.transferFlow.byRegistrar", {
              client: process.actClientId,
            })}
      </p>
      <p className="text-xs [&_code]:text-current [&_code]:opacity-80">
        <Timestamp value={process.actionDate} />
      </p>
    </>
  );
}

function Stage({
  stage,
  position,
  process,
  connector = true,
  outcome = false,
}: {
  stage: TransferStage;
  position: TransferPosition;
  process: TransferProcess;
  connector?: boolean;
  outcome?: boolean;
}) {
  const state = position.states[stage];
  const current = state === "current";
  return (
    <li aria-current={current ? "step" : undefined} className={cn("relative", outcome && "max-sm:ml-6")}>
      {connector && <span aria-hidden className={cn("absolute top-1/2 right-full hidden w-6 border-t-2 sm:block", lineInto(state))} />}
      <div className={cn("flex h-full flex-col gap-1.5 rounded-lg border-2 p-3 text-sm", NODE[state])}>
        <p className="flex items-center gap-1.5 text-xs font-medium">
          {current ? (
            <>
              <span aria-hidden className="size-2 rounded-full bg-current" />
              {t("shared.transferFlow.current")}
            </>
          ) : (
            <>
              {state === "passed" && <Check aria-hidden className="size-3.5 text-success" />}
              {t(STATE_LABEL[state])}
            </>
          )}
        </p>
        <p className={cn("font-semibold", state === "closed" && "line-through decoration-muted-foreground/60")}>{t(TITLE[stage])}</p>
        <p className={cn("text-xs", !current && "text-muted-foreground")}>{description(stage, process)}</p>
        {details(stage, position, process)}
      </div>
    </li>
  );
}

/** Where a transfer stands, after the transfer status the registry reported. */
export function TransferFlow({ process }: { process: TransferProcess }) {
  const position = transferPositionOf(process);
  const outcomeLine = position.states.rejected === "current" || position.states.cancelled === "current" ? "border-primary" : "border-dashed border-border";
  return (
    <section aria-labelledby="transfer-flow-title" className="flex flex-col gap-4">
      <h3 id="transfer-flow-title" className="font-medium">
        {push(process) ? t("shared.transferFlow.titlePush") : process.transferDir === "pull" ? t("shared.transferFlow.titlePull") : t("shared.transferFlow.title")}
      </h3>
      {!position.known && (
        <Callout
          tone="warning"
          title={t("shared.transferFlow.unknownTitle", {
            status: position.trStatus,
          })}
        >
          {t("shared.transferFlow.unknownDescription")}
        </Callout>
      )}
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3 sm:gap-y-6">
        <ol aria-label={t("shared.transferFlow.mainLabel")} className="contents">
          {TRANSFER_MAIN_STAGES.map((stage, index) => (
            <Stage key={stage} stage={stage} position={position} process={process} connector={index > 0} />
          ))}
        </ol>
        {/* The outcomes branch off the decision, when the object never reaches the gaining registrar. */}
        <div aria-hidden className="relative hidden self-stretch sm:col-start-2 sm:-mt-6 sm:block">
          <div className={cn("ml-[50%] h-[calc(50%+0.75rem)] rounded-bl-lg border-b-2 border-l-2", outcomeLine)} />
          <p className="absolute top-3 left-[calc(50%+0.5rem)] pr-1 text-xs text-muted-foreground">{t("shared.transferFlow.branch")}</p>
        </div>
        <p className="flex items-center gap-1.5 pt-2 text-xs text-muted-foreground sm:hidden">
          <CornerDownRight aria-hidden className="size-3.5" />
          {t("shared.transferFlow.branch")}
        </p>
        {/* Two alternatives, not a sequence: the branch line arrives at the "or" between them. */}
        <div className="relative max-sm:contents">
          <span aria-hidden className={cn("absolute top-1/2 right-full hidden w-6 border-t-2 sm:block", outcomeLine)} />
          <ol aria-label={t("shared.transferFlow.outcomeLabel")} className="flex flex-col gap-3 max-sm:contents">
            {TRANSFER_OUTCOME_STAGES.map((stage, index) => (
              <Fragment key={stage}>
                {index > 0 && (
                  <li aria-hidden className="text-center text-xs text-muted-foreground max-sm:ml-6 max-sm:text-left">
                    {t("shared.transferFlow.or")}
                  </li>
                )}
                <Stage stage={stage} position={position} process={process} connector={false} outcome />
              </Fragment>
            ))}
          </ol>
        </div>
      </div>
      {position.known && position.current === "awaitingDecision" && <p className="max-w-prose text-sm text-muted-foreground">{t("shared.transferFlow.automaticNote")}</p>}
    </section>
  );
}
