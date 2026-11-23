import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "./FetchTransport";
import { createClientTransactionIdGenerator } from "./transactionId";

describe("client transaction ids", () => {
  it("are rpp-client- followed by eight digits", () => {
    const next = createClientTransactionIdGenerator();
    for (let i = 0; i < 200; i++) expect(next()).toMatch(/^rpp-client-[1-9]\d{7}$/);
  });

  it("covers the whole range of eight digits", () => {
    expect(createClientTransactionIdGenerator(() => 0)()).toBe("rpp-client-10000000");
    expect(createClientTransactionIdGenerator(() => 89_999_999)()).toBe("rpp-client-99999999");
  });

  it("never hands out the same id twice", () => {
    const draws = [5, 5, 5, 6];
    const next = createClientTransactionIdGenerator(() => draws.shift() ?? 0);
    expect([next(), next()]).toEqual(["rpp-client-10000005", "rpp-client-10000006"]);
  });
});

describe("transport and RPP-Cltrid", () => {
  const respond = () => new Response("{}", { headers: { "Content-Type": "application/rpp+json" } });

  it("sends one on every request, also public ones, and reports it", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => respond());
    const transport = createFetchTransport({ baseUrl: "https://rpp.example.test/rpp", fetch: fetchMock });
    const first = await transport.send({ method: "GET", target: "https://rpp.example.test/.well-known/rpp", authenticate: false, preset: null });
    const second = await transport.send({ method: "GET", target: "presets/x/schema" });
    const sent = (index: number) => new Headers(fetchMock.mock.calls[index]?.[1]?.headers).get("RPP-Cltrid");

    expect(sent(0)).toMatch(/^rpp-client-\d{8}$/);
    expect(sent(1)).toMatch(/^rpp-client-\d{8}$/);
    expect(sent(0)).not.toBe(sent(1));
    expect(first.sentClientTransactionId).toBe(sent(0));
    expect(second.sentClientTransactionId).toBe(sent(1));
  });

  it("keeps the id of the caller, and can use another source of ids", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => respond());
    const transport = createFetchTransport({ baseUrl: "https://rpp.example.test", fetch: fetchMock, newClientTransactionId: () => "MINE-9" });
    await transport.send({ method: "GET", target: "a", clientTransactionId: "CALLER-1" });
    await transport.send({ method: "GET", target: "a" });
    const sent = (index: number) => new Headers(fetchMock.mock.calls[index]?.[1]?.headers).get("RPP-Cltrid");
    expect([sent(0), sent(1)]).toEqual(["CALLER-1", "MINE-9"]);
  });

  it("records the id in the diagnostics", async () => {
    const entries: Record<string, string>[] = [];
    const transport = createFetchTransport({
      baseUrl: "https://rpp.example.test",
      fetch: async () => respond(),
      onExchange: (record) => entries.push(record.request.headers),
    });
    await transport.send({ method: "GET", target: "a" });
    expect(entries[0]?.["rpp-cltrid"]).toMatch(/^rpp-client-\d{8}$/);
  });
});
