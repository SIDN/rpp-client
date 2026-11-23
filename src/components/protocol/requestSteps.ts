import type { RequestActivity } from "@/rpp/client/progress";

export type StepState = "pending" | "active" | "done" | "failed";

export interface Step {
  label: string;
  /** What is going on, as a sentence. */
  doing: string;
  state: StepState;
  ms: number | undefined;
}

const LABELS = [
  { label: "Preparing", doing: "Preparing the request" },
  { label: "Registry", doing: "Waiting for the registry" },
  { label: "Answer", doing: "Reading the answer" },
] as const;

/**
 * The three stretches of a request, from the marks the transport reports: until it is sent, until the registry has
 * answered, until the answer is read. Without an activity, the request has not been reported yet and is preparing.
 */
export function stepsOf(activity: RequestActivity | undefined, now: number): Step[] {
  const marks = activity ? [activity.startedAt, activity.sentAt, activity.headersAt, activity.readAt] : [undefined, undefined, undefined, undefined];
  const finished = activity?.stage === "finished";
  const failed = activity?.failed ?? false;
  return LABELS.map(({ label, doing }, index): Step => {
    const start = marks[index] ?? (index === 0 ? now : undefined);
    const end = marks[index + 1];
    if (start === undefined) return { label, doing, state: "pending", ms: undefined };
    if (end !== undefined) return { label, doing, state: "done", ms: Math.max(0, end - start) };
    const until = finished ? (activity?.finishedAt ?? now) : now;
    return { label, doing, state: finished ? (failed ? "failed" : "done") : "active", ms: Math.max(0, until - start) };
  });
}

export const formatMs = (ms: number | undefined): string =>
  ms === undefined ? "" : ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;
