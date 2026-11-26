import { RotateCcw } from "lucide-react";
import { useWatch, type FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { t } from "@/i18n";
import { sameValues, type DraftForm, type PrefillSource } from "./drafts";

/** Puts the form back to `to`: empty for a new object, the object as loaded for a change. Disabled while it is so already. */
export function ResetButton<T extends FieldValues>({ draft, to, children }: { draft: DraftForm<T>; to: T; children: string }) {
  // Watched only so that the button follows what is typed.
  useWatch({ control: draft.form.control });
  const unchanged = sameValues(draft.form.getValues(), to) && draft.source === undefined;
  return (
    <Button variant="ghost" disabled={unchanged} onClick={() => draft.resetTo(to)}>
      <RotateCcw aria-hidden />
      {children}
    </Button>
  );
}

/** Says what a new object's form was filled in from, or offers to fill it in from the object last loaded. */
export function PrefillNote<T extends FieldValues>({ draft, source }: { draft: DraftForm<T>; source: PrefillSource<T> | undefined }) {
  if (draft.source !== undefined) {
    return (
      <Callout tone="info" title={t("shared.prefill.filledFrom", { id: draft.source })}>
        {t("shared.prefill.filledFromHint")}
      </Callout>
    );
  }
  if (!source) return null;
  return (
    <Callout tone="info" title={t("shared.prefill.available", { id: source.id })}>
      <Button variant="secondary" size="sm" className="mt-2" onClick={() => draft.resetTo(source.values, source.id)}>
        {t("shared.prefill.fill", { id: source.id })}
      </Button>
    </Callout>
  );
}
