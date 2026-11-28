import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Offered with the info of an object: copies its details to the form that creates a new one. */
export function CloneAction({ onClone, hint, disabled = false }: { onClone(): void; hint: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button variant="secondary" size="sm" disabled={disabled} onClick={onClone}>
        {t("shared.clone.button")}
      </Button>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
