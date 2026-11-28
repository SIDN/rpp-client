import type { TransferProcess } from "@/rpp/core/types/objects";

/**
 * The stages of a transfer, after RPP data-objects §2.7.7 and the Transfer Process Object (§10.1). The main line ends
 * with the object at the gaining registrar; the outcomes branch off the decision when it never gets there.
 */
export const TRANSFER_MAIN_STAGES = ["requested", "awaitingDecision", "transferred"] as const;
export const TRANSFER_OUTCOME_STAGES = ["rejected", "cancelled"] as const;

export type TransferStage = (typeof TRANSFER_MAIN_STAGES)[number] | (typeof TRANSFER_OUTCOME_STAGES)[number];

/**
 * - `passed`: the transfer went through this stage.
 * - `current`: where the transfer is now.
 * - `skipped`: on the way, but passed over (a transfer the registry approved directly).
 * - `ahead`: still possible from where the transfer is.
 * - `closed`: no longer possible from where the transfer is.
 */
export type TransferStageState = "passed" | "current" | "skipped" | "ahead" | "closed";

/** Who took the action a final `trStatus` names: a registrar (`client…`) or the registry (`server…`). */
export type TransferDecider = "client" | "server";

export type TransferPosition =
  | {
      known: true;
      current: TransferStage;
      decidedBy?: TransferDecider;
      states: Record<TransferStage, TransferStageState>;
    }
  /** A `trStatus` outside the draft's enumeration: kept as it came, with no place in the flow. */
  | {
      known: false;
      trStatus: string;
      states: Record<TransferStage, TransferStageState>;
    };

const states = (entries: Record<TransferStage, TransferStageState>) => entries;

const ended = (current: TransferStage, awaitingDecision: TransferStageState): Record<TransferStage, TransferStageState> => ({
  requested: "passed",
  awaitingDecision,
  transferred: current === "transferred" ? "current" : "closed",
  rejected: current === "rejected" ? "current" : "closed",
  cancelled: current === "cancelled" ? "current" : "closed",
});

/** Where a transfer process stands, after its `trStatus`. */
export function transferPositionOf(process: Pick<TransferProcess, "trStatus" | "requestDate" | "actionDate">): TransferPosition {
  switch (process.trStatus) {
    case "pending":
      return {
        known: true,
        current: "awaitingDecision",
        states: states({
          requested: "passed",
          awaitingDecision: "current",
          transferred: "ahead",
          rejected: "ahead",
          cancelled: "ahead",
        }),
      };
    case "clientApproved":
      return {
        known: true,
        current: "transferred",
        decidedBy: "client",
        states: ended("transferred", "passed"),
      };
    case "serverApproved":
      // Completed the moment it was requested: the registry approved directly and no registrar was asked (§2.7.7).
      return {
        known: true,
        current: "transferred",
        decidedBy: "server",
        states: ended("transferred", process.actionDate === process.requestDate ? "skipped" : "passed"),
      };
    case "clientRejected":
      return {
        known: true,
        current: "rejected",
        decidedBy: "client",
        states: ended("rejected", "passed"),
      };
    case "clientCancelled":
      return {
        known: true,
        current: "cancelled",
        decidedBy: "client",
        states: ended("cancelled", "passed"),
      };
    case "serverCancelled":
      return {
        known: true,
        current: "cancelled",
        decidedBy: "server",
        states: ended("cancelled", "passed"),
      };
    default:
      return {
        known: false,
        trStatus: process.trStatus,
        states: states({
          requested: "ahead",
          awaitingDecision: "ahead",
          transferred: "ahead",
          rejected: "ahead",
          cancelled: "ahead",
        }),
      };
  }
}
