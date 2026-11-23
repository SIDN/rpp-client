import type { AppSettings } from "./appSettings";
import { loadBookmarks, type Bookmark } from "./bookmarks";
import type { ConnectionProfile } from "./connectionProfile";

/** The bookmark chosen as the default, if it still exists. */
export const defaultBookmark = (settings: Pick<AppSettings, "defaultBookmarkId">, bookmarks: readonly Bookmark[]): Bookmark | undefined =>
  settings.defaultBookmarkId === undefined ? undefined : bookmarks.find((bookmark) => bookmark.id === settings.defaultBookmarkId);

/**
 * The profile to connect to when the client starts, or undefined. Passwords are never kept, so only a default
 * bookmark without authentication can be connected to without asking.
 */
export function autoConnectProfile(
  settings: Pick<AppSettings, "defaultBookmarkId" | "autoConnect">,
  bookmarks: readonly Bookmark[] = loadBookmarks(),
): ConnectionProfile | undefined {
  if (!settings.autoConnect) return undefined;
  const bookmark = defaultBookmark(settings, bookmarks);
  return bookmark?.profile.auth.type === "none" ? bookmark.profile : undefined;
}
