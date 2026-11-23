// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RequestActivity } from "@/rpp/client/progress";
import { RequestProgress } from "./RequestProgress";
import { stepsOf } from "./requestSteps";

const activity = (change: Partial<RequestActivity> = {}): RequestActivity => ({
  id: "a",
  seq: 1,
  method: "POST",
  url: "https://rpp.example.test/rpp/domainNames",
  clientTransactionId: "C-1",
  status: undefined,
  stage: "preparing",
  failed: false,
  startedAt: 100,
  sentAt: undefined,
  headersAt: undefined,
  readAt: undefined,
  finishedAt: undefined,
  ...change,
});

const states = (value: RequestActivity | undefined, now: number) => stepsOf(value, now).map((step) => step.state);

describe("steps of a request", () => {
  it("is preparing before the request is reported", () => {
    expect(states(undefined, 0)).toEqual(["active", "pending", "pending"]);
  });

  it("moves along with the marks and counts the time of the stretch it is in", () => {
    expect(states(activity(), 130)).toEqual(["active", "pending", "pending"]);
    const waiting = activity({ stage: "waiting", sentAt: 110 });
    expect(states(waiting, 400)).toEqual(["done", "active", "pending"]);
    expect(stepsOf(waiting, 400).map((step) => step.ms)).toEqual([10, 290, undefined]);
    const reading = activity({ stage: "reading", sentAt: 110, headersAt: 300, status: 200 });
    expect(states(reading, 320)).toEqual(["done", "done", "active"]);
  });

  it("is done when the answer was read, and failed where the request stopped", () => {
    const done = activity({ stage: "finished", sentAt: 110, headersAt: 300, readAt: 310, finishedAt: 312, status: 200 });
    expect(states(done, 999)).toEqual(["done", "done", "done"]);
    expect(stepsOf(done, 999).map((step) => step.ms)).toEqual([10, 190, 10]);
    const noAnswer = activity({ stage: "finished", failed: true, sentAt: 110, finishedAt: 5000 });
    expect(states(noAnswer, 9999)).toEqual(["done", "failed", "pending"]);
    const notSent = activity({ stage: "finished", failed: true, finishedAt: 105 });
    expect(states(notSent, 9999)).toEqual(["failed", "pending", "pending"]);
  });

  it("never counts a negative time", () => {
    expect(stepsOf(activity(), 50)[0]?.ms).toBe(0);
  });
});

describe("request progress", () => {
  it("shows nothing when nothing is going on", () => {
    const { container } = render(<RequestProgress activity={undefined} pending={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the stage a request is in, with a way to cancel", () => {
    let cancelled = false;
    render(<RequestProgress activity={activity({ stage: "waiting", sentAt: 110 })} pending onCancel={() => (cancelled = true)} />);
    const region = screen.getByRole("region", { name: "Request progress" });
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(within(region).getByRole("status")).toHaveTextContent("Waiting for the registry");
    expect(within(region).getByRole("listitem", { current: "step" })).toHaveTextContent("Registry");
    expect(within(region).getByText("POST")).toBeInTheDocument();
    within(region).getByRole("button", { name: "Cancel the request" }).click();
    expect(cancelled).toBe(true);
  });

  it("is preparing while the action has no request yet", () => {
    render(<RequestProgress activity={undefined} pending />);
    expect(screen.getByRole("status")).toHaveTextContent("Preparing the request");
  });

  it("keeps the track of a finished request and says how it ended", () => {
    const done = activity({ stage: "finished", sentAt: 110, headersAt: 300, readAt: 310, finishedAt: 312, status: 409 });
    render(<RequestProgress activity={done} pending={false} onCancel={() => undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("The registry answered with HTTP 409.");
    expect(screen.getByRole("region")).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("212 ms in all")).toBeInTheDocument();
  });

  it("says when no answer came", () => {
    render(<RequestProgress activity={activity({ stage: "finished", failed: true, sentAt: 110, finishedAt: 5110 })} pending={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("No answer came.");
  });

  it("shows one track, and a new request takes the place of the one before it", () => {
    const first = activity({ id: "a", seq: 1, method: "GET", stage: "finished", sentAt: 110, headersAt: 300, readAt: 310, finishedAt: 312, status: 200 });
    const { rerender } = render(<RequestProgress activity={first} pending={false} />);
    expect(screen.getAllByRole("list", { name: "Progress of the request" })).toHaveLength(1);
    expect(screen.getByText("GET")).toBeInTheDocument();

    rerender(<RequestProgress activity={activity({ id: "b", seq: 2, method: "PATCH", stage: "waiting", sentAt: 410 })} pending />);
    expect(screen.getAllByRole("list", { name: "Progress of the request" })).toHaveLength(1);
    expect(screen.queryByText("GET")).toBeNull();
    expect(screen.getByText("PATCH")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for the registry");
  });
});
