import type { RppObject } from "@/rpp/core/types/objects";
import { isJsonObject } from "@/rpp/core/types/json";
import type { QueryObject, QueryResults } from "@/rpp/query/queryObject";
import { synthesizeSearchResults } from "../search/synthesize";

/*
 * The Overview screen asks three questions of the domain collection with the optional `query` operation
 * (draft-ietf-rpp-data-objects issue 210). A server gives no counts, so the screen shows the first page of each and
 * whether there is more; it never claims a total.
 */

export type OverviewPanel = "expiring" | "pendingTransfer" | "redemption";

export const OVERVIEW_PANELS: readonly OverviewPanel[] = ["expiring", "pendingTransfer", "redemption"];

/** The expiry window of the Overview, in days from now. */
export const EXPIRY_WINDOW_DAYS = 30;
export const EXPIRING_LIMIT = 25;
export const LIST_LIMIT = 10;

const DAY = 24 * 60 * 60 * 1000;

const timestamp = (time: number) => new Date(time).toISOString().replace(/\.\d{3}Z$/, "Z");

/** The status whose `due` date matters for each list. */
const STATUS_OF: Record<Exclude<OverviewPanel, "expiring">, string> = {
  pendingTransfer: "pendingTransfer",
  redemption: "rgpRedemptionPeriod",
};

/** The Query Object of a panel, for the time `now`. */
export function overviewQuery(panel: OverviewPanel, now: Date): QueryObject {
  if (panel === "expiring") {
    return {
      filter: {
        and: [
          { element: "expiryDate", op: "ge", value: timestamp(now.getTime()) },
          { element: "expiryDate", op: "le", value: timestamp(now.getTime() + EXPIRY_WINDOW_DAYS * DAY) },
        ],
      },
      sort: [{ element: "expiryDate", direction: "asc" }],
      limit: EXPIRING_LIMIT,
    };
  }
  return {
    filter: { element: "status.label", op: "eq", value: STATUS_OF[panel] },
    // The soonest decision or end first; `status.due` is the date the status is removed or changed.
    sort: [{ element: "status.due", direction: "asc" }],
    limit: LIST_LIMIT,
  };
}

export interface OverviewEntry {
  name: string;
  /** The expiry date, or the `due` date of the status: when it is removed or changed. Absent when the server gives none. */
  date: string | undefined;
  /** Whole days from now until `date`; 0 is within a day, negative has passed. */
  daysLeft: number | undefined;
  /** Where `date` falls in the expiry window, from 0 (now) to 1 (the end); only for the expiring panel. */
  position: number | undefined;
}

export interface OverviewList {
  entries: OverviewEntry[];
  /** The server has more matches than this page. */
  more: boolean;
}

function dateOf(panel: OverviewPanel, object: Record<string, unknown>): string | undefined {
  if (panel === "expiring") return typeof object.expiryDate === "string" ? object.expiryDate : undefined;
  if (!Array.isArray(object.status)) return undefined;
  const status: unknown = object.status.find((item: unknown) => isJsonObject(item) && item.label === STATUS_OF[panel]);
  return isJsonObject(status) && typeof status.due === "string" ? status.due : undefined;
}

/** The entries of a panel from a page of query results; objects without a name are left out. */
export function overviewList(panel: OverviewPanel, page: QueryResults<unknown>, now: Date): OverviewList {
  const entries: OverviewEntry[] = [];
  for (const object of page.results) {
    if (!isJsonObject(object) || typeof object.name !== "string") continue;
    const date = dateOf(panel, object);
    const time = date === undefined ? Number.NaN : Date.parse(date);
    const known = !Number.isNaN(time);
    entries.push({
      name: object.name,
      date,
      daysLeft: known ? Math.floor((time - now.getTime()) / DAY) : undefined,
      position: panel === "expiring" && known ? Math.min(Math.max((time - now.getTime()) / (EXPIRY_WINDOW_DAYS * DAY), 0), 1) : undefined,
    });
  }
  return { entries, more: page.nextCursor !== undefined };
}

/** The most dots stacked on one day of the timeline; the rest of that day is a count. */
export const TIMELINE_STACK = 5;

export interface TimelineDay {
  /** Days from now, 0 to the end of the expiry window. */
  day: number;
  /** The entries drawn as a dot, at most `TIMELINE_STACK`. */
  shown: OverviewEntry[];
  /** The entries of the day beyond the stack, counted rather than drawn. */
  hidden: OverviewEntry[];
}

export interface OverviewTimeline {
  days: TimelineDay[];
  /**
   * The last day the page tells about, when the server has more matches: the page holds the soonest expiries, so the
   * days after it are unknown, not empty. Absent when the whole window is known.
   */
  knownUntil: number | undefined;
}

/** The entries of the expiring panel by the day they expire, for the timeline; entries without a date are left out. */
export function overviewTimeline(list: OverviewList, stack = TIMELINE_STACK): OverviewTimeline {
  const byDay = new Map<number, OverviewEntry[]>();
  for (const entry of list.entries) {
    if (entry.position === undefined || entry.daysLeft === undefined) continue;
    const day = Math.min(Math.max(entry.daysLeft, 0), EXPIRY_WINDOW_DAYS);
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, entries]) => ({ day, shown: entries.slice(0, stack), hidden: entries.slice(stack) }));
  const last = days.length > 0 ? days[days.length - 1].day : 0;
  return { days, knownUntil: list.more && last < EXPIRY_WINDOW_DAYS ? last : undefined };
}

/**
 * Made-up results of a panel's query, as the search screen synthesizes them, with a `due` date on the status of the
 * two lists so that they show what a server could tell. Nothing of it comes from a server.
 */
export function synthesizeOverview(panel: OverviewPanel, now: Date, options: { tld?: string; seed?: number } = {}): QueryResults<RppObject> {
  // Each panel its own numbers, so that no name is both in transfer and in redemption.
  const seed = (options.seed ?? 1) + OVERVIEW_PANELS.indexOf(panel) * 7919;
  const page = synthesizeSearchResults("domainName", overviewQuery(panel, now), { now, tld: options.tld, seed });
  if (panel === "expiring") return page;
  const days = (index: number) => (panel === "pendingTransfer" ? 1 + ((index * 3) % 5) : 1 + ((index * 11) % 30));
  const results = page.results.map((object, index) => {
    const record = object as Record<string, unknown>;
    if (!Array.isArray(record.status)) return object;
    const status = record.status.map((item: unknown) =>
      isJsonObject(item) && item.label === STATUS_OF[panel] && item.due === undefined
        ? { ...item, due: timestamp(now.getTime() + days(index) * DAY + 3 * 60 * 60 * 1000) }
        : item,
    );
    return { ...record, status } as unknown as RppObject;
  });
  // The dates are new, so the page is put in the order the query asks for again.
  const due = (object: RppObject) => dateOf(panel, object as Record<string, unknown>) ?? "";
  results.sort((a, b) => due(a).localeCompare(due(b)));
  return { ...page, results };
}
