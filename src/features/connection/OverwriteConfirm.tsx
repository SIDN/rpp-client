import { useId } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Asks before a bookmark is replaced by what is in the form. */
export function OverwriteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm(): void; onCancel(): void }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-md border-2 border-danger p-4">
      <h4 id={`${id}-title`} className="font-semibold">
        {t("connection.bookmarks.confirmOverwrite", { name })}
      </h4>
      <p className="text-sm">{t("connection.bookmarks.overwriteExplanation")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" onClick={onConfirm}>
          {t("connection.bookmarks.overwrite", { name })}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t("connection.bookmarks.cancelOverwrite")}
        </Button>
      </div>
    </div>
  );
}
