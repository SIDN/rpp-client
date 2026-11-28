import { describe, expect, it } from "vitest";
import { transferPositionOf } from "./transferFlow";

const at = (trStatus: string, actionDate = "2026-01-06T00:00:00Z") =>
  transferPositionOf({
    trStatus,
    requestDate: "2026-01-01T00:00:00Z",
    actionDate,
  });

describe("transferPositionOf", () => {
  it("puts a pending transfer at the decision, with every outcome still open", () => {
    expect(at("pending")).toEqual({
      known: true,
      current: "awaitingDecision",
      states: {
        requested: "passed",
        awaitingDecision: "current",
        transferred: "ahead",
        rejected: "ahead",
        cancelled: "ahead",
      },
    });
  });

  it("ends an approved transfer at the gaining registrar and closes the other outcomes", () => {
    expect(at("clientApproved")).toEqual({
      known: true,
      current: "transferred",
      decidedBy: "client",
      states: {
        requested: "passed",
        awaitingDecision: "passed",
        transferred: "current",
        rejected: "closed",
        cancelled: "closed",
      },
    });
  });

  it("passes over the decision when the registry approved at the moment of the request", () => {
    expect(at("serverApproved", "2026-01-01T00:00:00Z")).toMatchObject({
      current: "transferred",
      decidedBy: "server",
      states: { awaitingDecision: "skipped" },
    });
    expect(at("serverApproved")).toMatchObject({
      decidedBy: "server",
      states: { awaitingDecision: "passed" },
    });
  });

  it("tells a rejection from a cancellation, and the registrar from the registry", () => {
    expect(at("clientRejected")).toMatchObject({
      current: "rejected",
      decidedBy: "client",
      states: {
        transferred: "closed",
        rejected: "current",
        cancelled: "closed",
      },
    });
    expect(at("clientCancelled")).toMatchObject({
      current: "cancelled",
      decidedBy: "client",
    });
    expect(at("serverCancelled")).toMatchObject({
      current: "cancelled",
      decidedBy: "server",
      states: { rejected: "closed", cancelled: "current" },
    });
  });

  it("keeps an unknown status as it came, without a place in the flow", () => {
    const position = at("clientEscalated");
    expect(position).toMatchObject({
      known: false,
      trStatus: "clientEscalated",
    });
    expect(Object.values(position.states)).not.toContain("current");
  });
});
