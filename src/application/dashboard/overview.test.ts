import { describe, expect, it } from "vitest";
import { validateQueryObject } from "@/rpp/query/queryObject";
import { EXPIRY_WINDOW_DAYS, LIST_LIMIT, OVERVIEW_PANELS, overviewList, overviewQuery, overviewTimeline, synthesizeOverview } from "./overview";

const NOW = new Date("2026-05-01T10:00:00.250Z");

describe("overviewQuery", () => {
  it("asks for the domain names that expire within the window, soonest first", () => {
    expect(overviewQuery("expiring", NOW)).toEqual({
      filter: {
        and: [
          { element: "expiryDate", op: "ge", value: "2026-05-01T10:00:00Z" },
          { element: "expiryDate", op: "le", value: "2026-05-31T10:00:00Z" },
        ],
      },
      sort: [{ element: "expiryDate", direction: "asc" }],
      limit: 25,
    });
  });

  it("asks for a status, the soonest due date first", () => {
    expect(overviewQuery("pendingTransfer", NOW)).toEqual({
      filter: { element: "status.label", op: "eq", value: "pendingTransfer" },
      sort: [{ element: "status.due", direction: "asc" }],
      limit: LIST_LIMIT,
    });
    expect(overviewQuery("redemption", NOW).filter).toEqual({ element: "status.label", op: "eq", value: "rgpRedemptionPeriod" });
  });

  it.each(OVERVIEW_PANELS)("builds a valid Query Object for %s", (panel) => {
    expect(validateQueryObject(overviewQuery(panel, NOW)).status).toBe("valid");
  });
});

describe("overviewList", () => {
  it("takes the date that matters, the days left and the place in the window", () => {
    const list = overviewList(
      "expiring",
      { results: [{ name: "a.nl", expiryDate: "2026-05-16T10:00:00Z" }, { name: "b.nl", expiryDate: "2026-05-01T12:00:00Z" }], nextCursor: "c" },
      NOW,
    );
    expect(list.more).toBe(true);
    expect(list.entries).toEqual([
      { name: "a.nl", date: "2026-05-16T10:00:00Z", daysLeft: 14, position: expect.closeTo(0.5, 5) },
      expect.objectContaining({ name: "b.nl", daysLeft: 0 }),
    ]);
  });

  it("reads the due date of the status of the list, and keeps entries without one", () => {
    const list = overviewList(
      "redemption",
      {
        results: [
          { name: "a.nl", status: [{ label: "inactive", due: "2026-05-02T00:00:00Z" }, { label: "rgpRedemptionPeriod", due: "2026-05-04T10:00:00Z" }] },
          { name: "b.nl", status: [{ label: "rgpRedemptionPeriod" }] },
          { name: "c.nl", status: [{ label: "rgpRedemptionPeriod", due: "soon" }] },
          { id: "no-name" },
          "not an object",
        ],
      },
      NOW,
    );
    expect(list.more).toBe(false);
    expect(list.entries).toEqual([
      { name: "a.nl", date: "2026-05-04T10:00:00Z", daysLeft: 2, position: undefined },
      { name: "b.nl", date: undefined, daysLeft: undefined, position: undefined },
      { name: "c.nl", date: "soon", daysLeft: undefined, position: undefined },
    ]);
  });
});

describe("overviewTimeline", () => {
  const expiring = (days: number[], more = false) =>
    overviewList(
      "expiring",
      { results: days.map((day, index) => ({ name: `d${index}.nl`, expiryDate: new Date(NOW.getTime() + day * 86400000 + 3600000).toISOString() })), nextCursor: more ? "c" : undefined },
      NOW,
    );

  it("stacks a busy day up to the limit and counts the rest", () => {
    const timeline = overviewTimeline(expiring([2, 2, 2, 2, 5, 2, 2, 2]), 5);
    expect(timeline.days.map(({ day, shown, hidden }) => [day, shown.length, hidden.map((entry) => entry.name)])).toEqual([
      [2, 5, ["d6.nl", "d7.nl"]],
      [5, 1, []],
    ]);
    expect(timeline.knownUntil).toBeUndefined();
  });

  it("knows the days up to the last one of the page when the server has more", () => {
    expect(overviewTimeline(expiring([1, 1, 4], true)).knownUntil).toBe(4);
    expect(overviewTimeline(expiring([], true)).knownUntil).toBe(0);
    expect(overviewTimeline(expiring([3, EXPIRY_WINDOW_DAYS - 1], false)).knownUntil).toBeUndefined();
  });
});

describe("synthesizeOverview", () => {
  it("makes up domain names that expire within the window, spread over it", () => {
    const { entries } = overviewList("expiring", synthesizeOverview("expiring", NOW, { tld: "nl" }), NOW);
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.every((entry) => entry.name.endsWith(".nl") && entry.daysLeft !== undefined && entry.daysLeft >= 0 && entry.daysLeft <= EXPIRY_WINDOW_DAYS)).toBe(true);
    const days = entries.map((entry) => entry.daysLeft ?? 0);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(Math.min(...days)).toBeLessThan(7);
    expect(Math.max(...days)).toBeGreaterThan(21);
  });

  it("gives the two lists a due date, soonest first, and no name in both", () => {
    const transfers = overviewList("pendingTransfer", synthesizeOverview("pendingTransfer", NOW), NOW);
    const redemption = overviewList("redemption", synthesizeOverview("redemption", NOW), NOW);
    for (const list of [transfers, redemption]) {
      expect(list.entries).toHaveLength(LIST_LIMIT);
      expect(list.more).toBe(true);
      const dates = list.entries.map((entry) => entry.date ?? "");
      expect(dates.every((date) => date > NOW.toISOString())).toBe(true);
      expect(dates).toEqual([...dates].sort());
    }
    const names = new Set(transfers.entries.map((entry) => entry.name));
    expect(redemption.entries.some((entry) => names.has(entry.name))).toBe(false);
  });
});
