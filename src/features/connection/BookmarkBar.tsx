import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import type { Bookmark } from "@/config/bookmarks";
import { t } from "@/i18n";

/**
 * The bar at the top of the connection screen: pick a saved server in the list, then use it (fill the form, so that only
 * the password is left to enter), edit it, or delete it after confirming.
 */
export function BookmarkBar({
  bookmarks,
  pickedId,
  onPick,
  onUse,
  onEdit,
  onDelete,
}: {
  bookmarks: readonly Bookmark[];
  pickedId: string | undefined;
  onPick(id: string | undefined): void;
  onUse(bookmark: Bookmark): void;
  onEdit(bookmark: Bookmark): void;
  onDelete(bookmark: Bookmark): void;
}) {
  const id = useId();
  const [confirming, setConfirming] = useState<string>();
  const picked = bookmarks.find((bookmark) => bookmark.id === pickedId);
  const asking = picked !== undefined && confirming === picked.id;

  return (
    <div role="toolbar" aria-label={t("connection.bookmarks.toolbar")} className="flex flex-col gap-2 rounded-md border border-border bg-muted/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id={`${id}-label`} className="text-sm font-medium">
          {t("connection.bookmarks.label")}
        </span>
        <Select
          aria-label={t("connection.bookmarks.select")}
          value={picked?.id ?? ""}
          disabled={bookmarks.length === 0}
          onChange={(event) => {
            setConfirming(undefined);
            onPick(event.target.value === "" ? undefined : event.target.value);
          }}
          className="w-full min-w-48 sm:w-72"
        >
          <option value="">{bookmarks.length === 0 ? t("connection.bookmarks.empty") : t("connection.bookmarks.choose")}</option>
          {bookmarks.map((bookmark) => (
            <option key={bookmark.id} value={bookmark.id}>
              {bookmark.name}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!picked} onClick={() => picked && onUse(picked)}>
            {t("connection.bookmarks.use")}
          </Button>
          <Button variant="secondary" disabled={!picked} onClick={() => picked && onEdit(picked)}>
            {t("connection.bookmarks.edit")}
          </Button>
          <Button variant="secondary" disabled={!picked} onClick={() => picked && setConfirming(picked.id)}>
            {t("connection.bookmarks.delete")}
          </Button>
        </div>
      </div>

      {picked && asking && (
        <div role="group" aria-labelledby={`${id}-confirm`} className="flex max-w-xl flex-col gap-3 rounded-md border-2 border-danger bg-background p-4">
          <h4 id={`${id}-confirm`} className="font-semibold">
            {t("connection.bookmarks.confirmDelete", { name: picked.name })}
          </h4>
          <p className="text-sm">{t("connection.bookmarks.deleteExplanation")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(undefined);
                onDelete(picked);
              }}
            >
              {t("connection.bookmarks.confirmDeleteButton", { name: picked.name })}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(undefined)}>
              {t("connection.bookmarks.cancelDelete")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
