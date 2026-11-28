import { Check, CornerDownRight } from "lucide-react";
import { t } from "@/i18n";
import { RGP_BRANCH_STAGES, RGP_MAIN_STAGES, RGP_STAGE_STATUSES, rgpPositionOf, type RgpStage, type RgpStageState } from "@/application/domains/rgpFlow";
import { Callout } from "@/components/ui/callout";
import { cn } from "@/lib/utils";
import type { RestoreProcess } from "@/rpp/core/types/objects";
import { Timestamp } from "../shared/objectParts";

const TITLE: Record<RgpStage, string> = {
  registered: "domains.restore.flow.registered",
  redemption: "domains.restore.flow.redemption",
  pendingRestore: "domains.restore.flow.pendingRestore",
  restored: "domains.restore.flow.restored",
  pendingDelete: "domains.restore.flow.pendingDelete",
  purged: "domains.restore.flow.purged",
};

const DESCRIPTION: Record<RgpStage, string> = {
  registered: "domains.restore.flow.registeredDescription",
  redemption: "domains.restore.flow.redemptionDescription",
  pendingRestore: "domains.restore.flow.pendingRestoreDescription",
  restored: "domains.restore.flow.restoredDescription",
  pendingDelete: "domains.restore.flow.pendingDeleteDescription",
  purged: "domains.restore.flow.purgedDescription",
};

const STATE_LABEL: Record<Exclude<RgpStageState, "current">, string> = {
  passed: "domains.restore.flow.passed",
  skipped: "domains.restore.flow.skipped",
  ahead: "domains.restore.flow.ahead",
  closed: "domains.restore.flow.closed",
};

const NODE: Record<RgpStageState, string> = {
  current: "border-primary bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/25",
  passed: "border-border bg-surface",
  skipped: "border-dashed border-border bg-surface text-muted-foreground",
  ahead: "border-dashed border-border bg-surface text-muted-foreground",
  closed: "border-dashed border-border bg-muted/40 text-muted-foreground",
};

/** A line into a stage: drawn solid where the domain went, dashed where it may still go. */
const lineInto = (state: RgpStageState) => (state === "passed" || state === "current" ? "border-primary" : "border-dashed border-border");

function Stage({ stage, state, process, first = false, branch = false }: { stage: RgpStage; state: RgpStageState; process: RestoreProcess; first?: boolean; branch?: boolean }) {
  const statuses = RGP_STAGE_STATUSES[stage];
  const current = state === "current";
  return (
    <li aria-current={current ? "step" : undefined} className={cn("relative", branch && "max-sm:ml-6")}>
      {!first && <span aria-hidden className={cn("absolute top-1/2 right-full hidden w-6 border-t-2 sm:block", lineInto(state))} />}
      <div className={cn("flex h-full flex-col gap-1.5 rounded-lg border-2 p-3 text-sm", NODE[state])}>
        <p className="flex items-center gap-1.5 text-xs font-medium">
          {current ? (
            <>
              <span aria-hidden className="size-2 rounded-full bg-current" />
              {t("domains.restore.flow.current")}
            </>
          ) : (
            <>
              {state === "passed" && <Check aria-hidden className="size-3.5 text-success" />}
              {t(STATE_LABEL[state])}
            </>
          )}
        </p>
        <p className={cn("font-semibold", state === "closed" && "line-through decoration-muted-foreground/60")}>{t(TITLE[stage])}</p>
        <p className={cn("text-xs", !current && "text-muted-foreground")}>{t(DESCRIPTION[stage])}</p>
        {statuses.length > 0 && (
          <p className="flex flex-wrap gap-1 text-xs">
            {statuses.map((status) => (
              <code key={status}>{status}</code>
            ))}
          </p>
        )}
        {current && stage === "pendingRestore" && process.reportDueDate && (
          <p className="text-xs font-medium [&_code]:text-current [&_code]:opacity-80">
            {t("domains.restore.flow.reportDue")} <Timestamp value={process.reportDueDate} />
          </p>
        )}
      </div>
    </li>
  );
}

/** Where the domain stands in the Redemption Grace Period, after the restore status the registry reported. */
export function RgpFlow({ process }: { process: RestoreProcess }) {
  const position = rgpPositionOf(process);
  return (
    <section aria-labelledby="rgp-flow-title" className="flex flex-col gap-4">
      <h3 id="rgp-flow-title" className="font-medium">
        {t("domains.restore.flow.title")}
      </h3>
      {!position.known && (
        <Callout tone="warning" title={t("domains.restore.flow.unknownTitle", { status: position.restoreStatus })}>
          {t("domains.restore.flow.unknownDescription")}
        </Callout>
      )}
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-4 sm:gap-y-6">
        <ol aria-label={t("domains.restore.flow.mainLabel")} className="contents">
          {RGP_MAIN_STAGES.map((stage, index) => (
            <Stage key={stage} stage={stage} state={position.states[stage]} process={process} first={index === 0} />
          ))}
        </ol>
        {/* The way out branches off the redemption period, when no restore comes in time. */}
        <div aria-hidden className="relative hidden self-stretch sm:col-start-2 sm:-mt-6 sm:block">
          <div className={cn("ml-[50%] h-[calc(50%+0.75rem)] rounded-bl-lg border-b-2 border-l-2", position.states.pendingDelete === "current" ? "border-primary" : "border-dashed border-border")} />
          <p className="absolute top-3 left-[calc(50%+0.5rem)] pr-1 text-xs text-muted-foreground">{t("domains.restore.flow.branch")}</p>
        </div>
        <p className="flex items-center gap-1.5 pt-2 text-xs text-muted-foreground sm:hidden">
          <CornerDownRight aria-hidden className="size-3.5" />
          {t("domains.restore.flow.branch")}
        </p>
        <ol aria-label={t("domains.restore.flow.branchLabel")} className="contents">
          {RGP_BRANCH_STAGES.map((stage) => (
            <Stage key={stage} stage={stage} state={position.states[stage]} process={process} branch />
          ))}
        </ol>
      </div>
      {position.known && position.current === "pendingRestore" && <p className="max-w-prose text-sm text-muted-foreground">{t("domains.restore.flow.reportLateNote")}</p>}
    </section>
  );
}
