import { z } from "zod";
import { DEFAULT_DOH_ENDPOINT } from "@/rpp/discovery/lookupPort";

export type TimeDisplay = "local" | "utc";

/** What the person has chosen for this client as a whole, not for one connection. Nothing in it is secret. */
export interface AppSettings {
  /** Screens that support it (Overview, Messages) show examples this client makes up, instead of asking the server. */
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
  /** DNS-over-HTTPS (JSON API) endpoint used to look up the port of a server. */
  dohEndpoint: string;
  /** Seconds to wait for the answer to any request to the RPP server. */
  requestTimeoutSeconds: number;
}

export const TIMEOUT_SECONDS = { min: 1, max: 300 } as const;

export const DEFAULT_SETTINGS: AppSettings = {
  // On, as the server cannot search or list yet.
  synthesizeData: true,
  defaultBookmarkId: undefined,
  autoConnect: false,
  messageLimit: 25,
  processPageSize: 25,
  timeDisplay: "local",
  dohEndpoint: DEFAULT_DOH_ENDPOINT,
  requestTimeoutSeconds: 5,
};

const count = (fallback: number) => z.number().int().min(1).max(1000).catch(fallback);

const storedSettingsSchema = z.object({
  synthesizeData: z.boolean().default(DEFAULT_SETTINGS.synthesizeData),
  defaultBookmarkId: z.string().min(1).optional().catch(undefined),
  autoConnect: z.boolean().catch(DEFAULT_SETTINGS.autoConnect),
  messageLimit: count(DEFAULT_SETTINGS.messageLimit),
  processPageSize: count(DEFAULT_SETTINGS.processPageSize),
  timeDisplay: z.enum(["local", "utc"]).catch(DEFAULT_SETTINGS.timeDisplay),
  dohEndpoint: z.url({ protocol: /^https$/ }).catch(DEFAULT_SETTINGS.dohEndpoint),
  requestTimeoutSeconds: z.number().int().min(TIMEOUT_SECONDS.min).max(TIMEOUT_SECONDS.max).catch(DEFAULT_SETTINGS.requestTimeoutSeconds),
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
