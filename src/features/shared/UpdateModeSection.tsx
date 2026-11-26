import { useId } from "react";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { t } from "@/i18n";
import type { UpdatePlan } from "./useObjectUpdate";

/**
 * The choice between a partial and a full update, and what a full update would send: the body, what the read showed
 * that is not part of the update view, and the members it leaves without a value. Goes inside the summary of a form.
 */
export function UpdateModeSection({ plan }: { plan: UpdatePlan }) {
  const { full } = plan;
  const name = useId();
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("updates.mode.legend")}</legend>
        <Choice type="radio" name={name} value="partial" checked={plan.mode === "partial"} onChange={() => plan.setMode("partial")} label={t("updates.mode.partial")} />
        <Choice type="radio" name={name} value="full" checked={plan.mode === "full"} onChange={() => plan.setMode("full")} label={t("updates.mode.full")} />
      </fieldset>
      {plan.mode === "partial" && plan.operations.length > 0 && (
        <BodyDetails summary={t("updates.partial.showBody")} label={t("updates.partial.bodyLabel")} body={plan.operations} />
      )}
      {full?.status === "loading" && <p className="text-sm text-muted-foreground">{t("updates.full.loading")}</p>}
      {full?.status === "unavailable" && (
        <Callout tone="warning" title={t("updates.full.unavailable")}>
          {full.reason}
        </Callout>
      )}
      {full?.status === "ready" && plan.operations.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          {full.includeElements.length > 0 && (
            <p className="text-muted-foreground">
              {t("updates.full.includeElements")} <code>?includeElements={full.includeElements.join("&includeElements=")}</code>
            </p>
          )}
          {full.cleared.length > 0 && (
            <Callout tone="warning" title={t("updates.full.clearedTitle")}>
              {t("updates.full.cleared")} {full.cleared.map((member, index) => (
                <span key={member}>
                  {index > 0 && ", "}
                  <code>{member}</code>
                </span>
              ))}
            </Callout>
          )}
          {full.dropped.length > 0 && (
            <p className="text-muted-foreground">
              {t("updates.full.dropped")} {full.dropped.map((pointer, index) => (
                <span key={pointer}>
                  {index > 0 && ", "}
                  <code>{pointer}</code>
                </span>
              ))}
            </p>
          )}
          <BodyDetails summary={t("updates.full.showBody")} label={t("updates.full.bodyLabel")} body={full.body} />
        </div>
      )}
    </div>
  );
}

function BodyDetails({ summary, label, body }: { summary: string; label: string; body: unknown }) {
  return (
    <details className="rounded-md border border-border text-sm">
      <summary className="cursor-pointer px-3 py-2 font-medium">{summary}</summary>
      <pre tabIndex={0} aria-label={label} className="max-h-[28rem] overflow-auto border-t border-border p-3 font-mono text-xs">
        {JSON.stringify(redacted(body), null, 2)}
      </pre>
    </details>
  );
}

/**
 * The body as shown: a password in it is not displayed, whether it is the `authdata` of an object (a full update, or the
 * value of a patch operation) or the value of an operation on `…/authdata`.
 */
function redacted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redacted);
  if (typeof value !== "object" || value === null) return value;
  const entries = Object.entries(value).map(([key, member]) => [key, key === "authdata" ? t("updates.full.hidden") : redacted(member)] as const);
  const result = Object.fromEntries(entries);
  if (typeof result.path === "string" && result.path.endsWith("/authdata") && "value" in result) result.value = t("updates.full.hidden");
  return result;
}
