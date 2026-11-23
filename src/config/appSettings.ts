import { z } from "zod";

export type TimeDisplay = "local" | "utc";

/** What the person has chosen for this client as a whole, not for one connection. Nothing in it is secret. */
export interface AppSettings {
  /** Screens show examples this client makes up, instead of asking the server. */
  synthesizeData: boolean;
  /** The bookmark the connection screen starts with; undefined when there is none. */
  defaultBookmarkId: string | undefined;
  /** Connect to the default bookmark when the client starts. Only done when it needs no password, as passwords are never kept. */
  autoConnect: boolean;
  /** How many messages the Messages screen shows to begin with. */
  messageLimit: number;
  /** How many rows a page of the Processes screen has to begin with. */
  processPageSize: number;
  /** Whether timestamps are shown in the time zone of this browser or in UTC. */
  timeDisplay: TimeDisplay;
}

export const DEFAULT_SETTINGS: AppSettings = {
  synthesizeData: false,
  defaultBookmarkId: undefined,
  autoConnect: false,
  messageLimit: 25,
  processPageSize: 25,
  timeDisplay: "local",
};

const count = (fallback: number) => z.number().int().min(1).max(1000).catch(fallback);

const storedSettingsSchema = z.object({
  synthesizeData: z.boolean().default(DEFAULT_SETTINGS.synthesizeData),
  defaultBookmarkId: z.string().min(1).optional().catch(undefined),
  autoConnect: z.boolean().catch(DEFAULT_SETTINGS.autoConnect),
  messageLimit: count(DEFAULT_SETTINGS.messageLimit),
  processPageSize: count(DEFAULT_SETTINGS.processPageSize),
  timeDisplay: z.enum(["local", "utc"]).catch(DEFAULT_SETTINGS.timeDisplay),
});

const STORAGE_KEY = "rpp-client.settings";

/** The stored settings, or the defaults for anything that is missing or is not settings. */
export function loadSettings(storage: Pick<Storage, "getItem"> = localStorage): AppSettings {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed = storedSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { ...parsed.data, defaultBookmarkId: parsed.data.defaultBookmarkId } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable or full; the choice still holds for this session.
  }
}
