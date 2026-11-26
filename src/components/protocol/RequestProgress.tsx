import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import type { RequestActivity } from "@/rpp/client/progress";
import { Button } from "@/components/ui/button";
import { formatMs, stepsOf, type Step } from "./requestSteps";

function useNow(running: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

function summary(activity: RequestActivity | undefined, steps: readonly Step[]): string {
  if (activity?.stage === "finished") {
    if (activity.failed) return t("protocol.progress.noAnswer");
    return activity.status === undefined ? t("protocol.progress.answeredNoStatus") : t("protocol.progress.answered", { status: activity.status });
  }
  return steps.find((step) => step.state === "active")?.doing ?? t("protocol.progress.preparingRequest");
}

function stateText(state: Step["state"]): string {
  switch (state) {
    case "done": return t("protocol.progress.stateDone");
    case "failed": return t("protocol.progress.stateFailed");
    case "active": return t("protocol.progress.stateActive");
    case "pending": return t("protocol.progress.statePending");
  }
}

function Track({ activity, now }: { activity: RequestActivity | undefined; now: number }) {
  const steps = stepsOf(activity, now);
  const total = activity ? Math.max(0, (activity.finishedAt ?? now) - activity.startedAt) : undefined;
  return (
    <div className="flex flex-col gap-3">
      {activity && (
        <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <code className="font-semibold">{activity.method}</code>
          <code className="min-w-0 break-all text-muted-foreground">{activity.url ?? "…"}</code>
        </p>
      )}
      <ol className="grid grid-cols-3 gap-2" aria-label={t("protocol.progress.stepsLabel")}>
        {steps.map((step) => (
          <li key={step.label} aria-current={step.state === "active" ? "step" : undefined} className="flex flex-col gap-1.5">
            <span
              aria-hidden
              className={cn(
                "relative block h-1.5 overflow-hidden rounded-full",
                (step.state === "pending" || step.state === "active") && "bg-muted",
                step.state === "done" && "bg-primary",
                step.state === "failed" && "bg-danger",
              )}
            >
              {step.state === "active" && (
                <span className="absolute inset-y-0 left-0 w-2/5 animate-shuttle rounded-full bg-accent motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-70" />
              )}
            </span>
            <span className="flex items-center justify-between gap-2 text-sm">
              <span className={cn("flex items-center gap-1.5", step.state === "pending" ? "text-muted-foreground" : "font-medium")}>
                {step.state === "done" && <Check aria-hidden className="size-3.5" />}
                {step.state === "failed" && <X aria-hidden className="size-3.5 text-danger-ink" />}
                {step.label}
                <span className="sr-only">{stateText(step.state)}</span>
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatMs(step.ms)}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="flex items-center justify-between gap-3 text-sm">
        <span role="status">{summary(activity, steps)}</span>
        {total !== undefined && <span className="font-mono text-xs tabular-nums text-muted-foreground">{t("protocol.progress.totalTime", { time: formatMs(total) })}</span>}
      </p>
    </div>
  );
}

/**
 * The request an action is making, as a track of its stretches: the latest one only, with no history of the requests before
 * it (the Exchanges screen keeps those). The stretch a request is in runs a light along its track and counts the time; a
 * finished request keeps its track, so the time spent stays readable, and a new request starts a track of its own.
 */
export function RequestProgress({
  activity,
  pending,
  onCancel,
  className,
}: {
  /** The latest request of the action; undefined before its first request has been reported. */
  activity: RequestActivity | undefined;
  /** The action has not ended, also before its first request has started. */
  pending: boolean;
  onCancel?: () => void;
  className?: string;
}) {
  const running = pending || (activity !== undefined && activity.stage !== "finished");
  const now = useNow(running);
  if (activity === undefined && !pending) return null;

  return (
    <section aria-label={t("protocol.progress.regionLabel")} aria-busy={running} className={cn("flex flex-col gap-4 rounded-md border border-border bg-surface p-4", className)}>
      <Track key={activity?.id ?? "preparing"} activity={activity} now={now} />
      {running && onCancel && (
        <div>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t("protocol.progress.cancel")}
          </Button>
        </div>
      )}
    </section>
  );
}
