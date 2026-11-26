import { parseProfile, type ConnectionProfile } from "./connectionProfile";
import { t } from "@/i18n";

/** A server the person connects to often: everything of the connection except the password, which is never kept. */
export interface Bookmark {
  id: string;
  /** The connection name, which identifies the bookmark: no two bookmarks have the same one, capitals aside. */
  name: string;
  profile: ConnectionProfile;
}

export const BOOKMARK_NAME_MAX = 60;

const STORAGE_KEY = "rpp-client.bookmarks";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What is wrong with a name, or undefined when it is fine. */
export function bookmarkNameProblem(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === "") return t("config.bookmark.nameRequired");
  if (trimmed.length > BOOKMARK_NAME_MAX) return t("config.bookmark.nameTooLong", { max: BOOKMARK_NAME_MAX });
  return undefined;
}

/** The stored bookmarks. An entry that is not a bookmark, whose profile does not pass the checks of the form, or whose name is taken, is left out. */
export function loadBookmarks(storage: Pick<Storage, "getItem"> = localStorage): Bookmark[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const bookmarks: Bookmark[] = [];
    for (const entry of parsed as unknown[]) {
      if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string" || bookmarkNameProblem(entry.name)) continue;
      const profile = parseProfile(entry.profile);
      const name = entry.name.trim();
      if (profile && !bookmarks.some((known) => known.id === entry.id || sameName(known.name, name))) bookmarks.push({ id: entry.id, name, profile });
    }
    return bookmarks;
  } catch {
    return [];
  }
}

export function saveBookmarks(bookmarks: readonly Bookmark[], storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // Storage can be unavailable or full; the bookmarks still work until the page is reloaded.
  }
}

function newBookmarkId(): string {
  return `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The bookmark with this name, other than `exceptId`. */
export const findByName = (bookmarks: readonly Bookmark[], name: string, exceptId?: string): Bookmark | undefined =>
  bookmarks.find((known) => known.id !== exceptId && sameName(known.name, name));

/**
 * Stores a bookmark under its name. A bookmark of that name is replaced; with `editingId` the bookmark being edited is
 * replaced instead (it may be renamed), and one that already has the new name is overwritten by it.
 */
export function storeBookmark(
  bookmarks: readonly Bookmark[],
  entry: { name: string; profile: ConnectionProfile },
  editingId?: string,
): { bookmarks: Bookmark[]; saved: Bookmark } {
  const name = entry.name.trim();
  const id = (editingId && bookmarks.some((known) => known.id === editingId) ? editingId : findByName(bookmarks, name)?.id) ?? newBookmarkId();
  const saved: Bookmark = { id, name, profile: entry.profile };
  const kept = bookmarks.filter((known) => known.id === id || !sameName(known.name, name));
  return { bookmarks: kept.some((known) => known.id === id) ? kept.map((known) => (known.id === id ? saved : known)) : [...kept, saved], saved };
}

export const removeBookmark = (bookmarks: readonly Bookmark[], id: string): Bookmark[] => bookmarks.filter((known) => known.id !== id);
