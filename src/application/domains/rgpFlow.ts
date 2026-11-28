import type { RestoreProcess } from "@/rpp/core/types/objects";

/**
 * The stages of the Redemption Grace Period, after the state diagram of RPP data-objects §9.3.5.1 (Figure 5),
 * itself adapted from RFC 3915 §2. The main line is the way back to the registry; the branch is the way out of it.
 */
export const RGP_MAIN_STAGES = ["registered", "redemption", "pendingRestore", "restored"] as const;
export const RGP_BRANCH_STAGES = ["pendingDelete", "purged"] as const;

export type RgpStage = (typeof RGP_MAIN_STAGES)[number] | (typeof RGP_BRANCH_STAGES)[number];

/**
 * - `passed`: the domain went through this stage.
 * - `current`: where the domain is now.
 * - `skipped`: on the way, but passed over (a restore that needed no separate report).
 * - `ahead`: still possible from where the domain is.
 * - `closed`: no longer possible from where the domain is.
 */
export type RgpStageState = "passed" | "current" | "skipped" | "ahead" | "closed";

/** The domain status values (§9.3.1, §9.3.5) a domain carries in each stage; empty where the draft names none. */
export const RGP_STAGE_STATUSES: Record<RgpStage, readonly string[]> = {
  registered: [],
  redemption: ["pendingDelete", "rgpRedemptionPeriod"],
  pendingRestore: ["pendingDelete", "rgpPendingRestore"],
  restored: [],
  pendingDelete: ["pendingDelete", "rgpPendingDelete"],
  purged: [],
};

export type RgpPosition =
  | { known: true; current: RgpStage; states: Record<RgpStage, RgpStageState> }
  /** A `restoreStatus` outside the draft's enumeration: kept as it came, with no place in the flow. */
  | { known: false; restoreStatus: string; states: Record<RgpStage, RgpStageState> };

const states = (entries: Record<RgpStage, RgpStageState>) => entries;

/** Where a restore process puts its domain in the Redemption Grace Period. */
export function rgpPositionOf(process: Pick<RestoreProcess, "restoreStatus" | "reportDate">): RgpPosition {
  switch (process.restoreStatus) {
    case "pendingRestore":
      return {
        known: true,
        current: "pendingRestore",
        states: states({ registered: "passed", redemption: "passed", pendingRestore: "current", restored: "ahead", pendingDelete: "ahead", purged: "ahead" }),
      };
    case "restored":
      return {
        known: true,
        current: "restored",
        // Without a report the registry needed none, or took it with the request: rgpPendingRestore was passed over.
        states: states({
          registered: "passed",
          redemption: "passed",
          pendingRestore: process.reportDate ? "passed" : "skipped",
          restored: "current",
          pendingDelete: "closed",
          purged: "closed",
        }),
      };
    case "rgpPendingDelete":
      return {
        known: true,
        current: "pendingDelete",
        states: states({ registered: "passed", redemption: "passed", pendingRestore: "closed", restored: "closed", pendingDelete: "current", purged: "ahead" }),
      };
    default:
      return {
        known: false,
        restoreStatus: process.restoreStatus,
        states: states({ registered: "ahead", redemption: "ahead", pendingRestore: "ahead", restored: "ahead", pendingDelete: "ahead", purged: "ahead" }),
      };
  }
}
