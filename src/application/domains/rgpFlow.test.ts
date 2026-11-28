import { describe, expect, it } from "vitest";
import { rgpPositionOf } from "./rgpFlow";

describe("rgpPositionOf", () => {
  it("puts a pending restore after the redemption period, with both ways still open", () => {
    expect(rgpPositionOf({ restoreStatus: "pendingRestore" })).toEqual({
      known: true,
      current: "pendingRestore",
      states: { registered: "passed", redemption: "passed", pendingRestore: "current", restored: "ahead", pendingDelete: "ahead", purged: "ahead" },
    });
  });

  it("marks the report step skipped for a restore that came back without a report, and done with one", () => {
    expect(rgpPositionOf({ restoreStatus: "restored" }).states).toMatchObject({ pendingRestore: "skipped", restored: "current", pendingDelete: "closed", purged: "closed" });
    expect(rgpPositionOf({ restoreStatus: "restored", reportDate: "2026-01-21T10:00:00Z" }).states.pendingRestore).toBe("passed");
  });

  it("puts rgpPendingDelete on the way out, with the restore closed", () => {
    expect(rgpPositionOf({ restoreStatus: "rgpPendingDelete" })).toMatchObject({
      known: true,
      current: "pendingDelete",
      states: { pendingRestore: "closed", restored: "closed", pendingDelete: "current", purged: "ahead" },
    });
  });

  it("keeps an unknown status as it came and gives it no place", () => {
    const position = rgpPositionOf({ restoreStatus: "somethingNew" });
    expect(position).toMatchObject({ known: false, restoreStatus: "somethingNew" });
    expect(Object.values(position.states)).not.toContain("current");
  });
});
