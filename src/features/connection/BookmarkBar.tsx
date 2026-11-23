import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import type { Bookmark } from "@/config/bookmarks";

const authText = (bookmark: Bookmark) => (bookmark.profile.auth.type === "basic" ? `User ${bookmark.profile.auth.username}` : "No authentication");

/**
 * The bar at the top of the connection screen: pick a saved server in the list, then use it (fill the form, so that only
 * the password is left to enter), edit it, or delete it after confirming.
 */
export function BookmarkBar({
  bookmarks,
  pickedId,
  activeId,
  editing,
  onPick,
  onUse,
  onEdit,
  onDelete,
}: {
  bookmarks: readonly Bookmark[];
  pickedId: string | undefined;
  /** The bookmark that is in the form. */
  activeId: string | undefined;
  editing: boolean;
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
    <div role="toolbar" aria-label="Bookmarks" className="flex flex-col gap-2 rounded-md border border-border bg-muted/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id={`${id}-label`} className="text-sm font-medium">
          Bookmarks
        </span>
        <Select
          aria-label="Bookmark"
          value={picked?.id ?? ""}
          disabled={bookmarks.length === 0}
          onChange={(event) => {
            setConfirming(undefined);
            onPick(event.target.value === "" ? undefined : event.target.value);
          }}
          className="w-full min-w-48 sm:w-72"
        >
          <option value="">{bookmarks.length === 0 ? "No bookmarks yet" : "Choose a bookmark"}</option>
          {bookmarks.map((bookmark) => (
            <option key={bookmark.id} value={bookmark.id}>
              {bookmark.name}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!picked} onClick={() => picked && onUse(picked)}>
            Use
          </Button>
          <Button variant="secondary" disabled={!picked} onClick={() => picked && onEdit(picked)}>
            Edit
          </Button>
          <Button variant="secondary" disabled={!picked} onClick={() => picked && setConfirming(picked.id)}>
            Delete
          </Button>
        </div>
      </div>

      {picked ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <code>{picked.profile.baseUrl}</code>
          <span aria-hidden>·</span>
          {authText(picked)}
          {picked.id === activeId && <Badge tone="info">{editing ? "Being edited" : "In the form"}</Badge>}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {bookmarks.length === 0 ? "Save the connection below as a bookmark to find it here later." : "A bookmark saves everything about a connection except the password."}
        </p>
      )}

      {picked && asking && (
        <div role="group" aria-labelledby={`${id}-confirm`} className="flex max-w-xl flex-col gap-3 rounded-md border-2 border-danger bg-background p-4">
          <h4 id={`${id}-confirm`} className="font-semibold">
            Delete the bookmark {picked.name}?
          </h4>
          <p className="text-sm">Only the bookmark is removed. The server and its data are not touched.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(undefined);
                onDelete(picked);
              }}
            >
              Delete {picked.name}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(undefined)}>
              Do not do it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
