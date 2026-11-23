import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "./FetchTransport";
import { createActivityLog, type ProgressEvent } from "./progress";

const BASE = "https://rpp.example.test/rpp";
const json = () => new Response("{}", { headers: { "Content-Type": "application/rpp+json" } });

describe("progress", () => {
  it("reports a request from start to finish, in order", async () => {
    const events: ProgressEvent[] = [];
    const transport = createFetchTransport({ baseUrl: BASE, fetch: async () => json(), onProgress: (event) => events.push(event) });
    await transport.send({ method: "GET", target: "domainNames/a", query: { access_token: "secret" } });
    expect(events.map((event) => event.phase)).toEqual(["started", "sent", "headers", "read", "finished"]);
    expect(new Set(events.map((event) => event.id)).size).toBe(1);
    const times = events.map((event) => event.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const sent = events[1];
    expect(sent?.phase === "sent" && sent.url).not.toContain("secret");
    expect(events[4]).toMatchObject({ outcome: "response" });
  });

  it("finishes a request that failed, also before it was sent", async () => {
    const events: ProgressEvent[] = [];
    const transport = createFetchTransport({
      baseUrl: BASE,
      fetch: async () => {
        throw new TypeError("down");
      },
      onProgress: (event) => events.push(event),
    });
    await transport.send({ method: "GET", target: "a" }).catch(() => undefined);
    await transport.send({ method: "GET", target: "a", body: {} }).catch(() => undefined);
    expect(events.map((event) => event.phase)).toEqual(["started", "sent", "finished", "started", "finished"]);
    expect(events.filter((event) => event.phase === "finished")).toEqual([
      expect.objectContaining({ outcome: "error" }),
      expect.objectContaining({ outcome: "error" }),
    ]);
  });

  it("survives a throwing listener", async () => {
    const transport = createFetchTransport({
      baseUrl: BASE,
      fetch: async () => json(),
      onProgress: vi.fn(() => {
        throw new Error("listener");
      }),
    });
    await expect(transport.send({ method: "GET", target: "a" })).resolves.toMatchObject({ status: 200 });
  });
});

describe("activity log", () => {
  it("follows requests through their stages and keeps the newest", async () => {
    const log = createActivityLog(2);
    const seen: string[] = [];
    log.subscribe(() => seen.push(log.entries().at(-1)?.stage ?? ""));
    const transport = createFetchTransport({ baseUrl: BASE, fetch: async () => json(), onProgress: log.record });

    expect(log.sequence()).toBe(0);
    await transport.send({ method: "POST", target: "a", body: {}, clientTransactionId: "C-1" });
    expect(seen).toEqual(["preparing", "waiting", "reading", "reading", "finished"]);
    const [first] = log.entries();
    expect(first).toMatchObject({ method: "POST", clientTransactionId: "C-1", status: 200, stage: "finished", failed: false, seq: 1 });
    expect(first?.url).toBe("https://rpp.example.test/rpp/a");
    expect(first?.finishedAt).toBeGreaterThanOrEqual(first?.startedAt ?? Infinity);

    await transport.send({ method: "GET", target: "b" });
    await transport.send({ method: "GET", target: "c" });
    expect(log.entries().map((entry) => entry.seq)).toEqual([2, 3]);
    expect(log.sequence()).toBe(3);
    log.clear();
    expect(log.entries()).toEqual([]);
    expect(log.sequence()).toBe(3);
  });

  it("marks a request that failed", async () => {
    const log = createActivityLog();
    const transport = createFetchTransport({
      baseUrl: BASE,
      fetch: async () => {
        throw new TypeError("down");
      },
      onProgress: log.record,
    });
    await transport.send({ method: "GET", target: "a" }).catch(() => undefined);
    expect(log.entries()[0]).toMatchObject({ stage: "finished", failed: true, status: undefined });
  });
});
