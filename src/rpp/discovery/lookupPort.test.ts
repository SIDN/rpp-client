import { describe, expect, it, vi } from "vitest";
import { lookupRppPort } from "./lookupPort";

const doh = (body: unknown, status = 200) => vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));

describe("lookupRppPort", () => {
  it("asks for the HTTPS record at _rpp.<host>", async () => {
    const fetchMock = doh({ Status: 0, Answer: [] });
    await lookupRppPort("rpp.example.test", { fetch: fetchMock });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("name")).toBe("_rpp.rpp.example.test");
    expect(url.searchParams.get("type")).toBe("HTTPS");
  });

  it("takes the port of the HTTPS record, in presentation format", async () => {
    const fetchMock = doh({ Status: 0, Answer: [{ type: 65, data: '1 . alpn="h2" port=8443' }] });
    expect(await lookupRppPort("rpp.example.test", { fetch: fetchMock })).toEqual({ port: 8443, portFound: true, source: "dns" });
  });

  it("takes the port of the HTTPS record, in wire format", async () => {
    // priority 1, root target, port=8443 (key 3, length 2)
    const fetchMock = doh({ Status: 0, Answer: [{ type: 65, data: "\\# 9 0001 00 0003 0002 20fb" }] });
    expect(await lookupRppPort("rpp.example.test", { fetch: fetchMock })).toEqual({ port: 8443, portFound: true, source: "dns" });
  });

  it("returns the target of the record, in either format", async () => {
    const text = doh({ Status: 0, Answer: [{ type: 65, data: "1 srv.example.net. port=8443" }] });
    expect(await lookupRppPort("a.test", { fetch: text })).toEqual({ port: 8443, portFound: true, target: "srv.example.net", source: "dns" });
    // priority 1, target "a.b", no params
    const wire = doh({ Status: 0, Answer: [{ type: 65, data: "\\# 7 0001 01 61 01 62 00" }] });
    expect(await lookupRppPort("a.test", { fetch: wire })).toEqual({ port: 443, portFound: false, target: "a.b", source: "dns" });
  });

  it("uses 443 when there is no record, or the record names no port", async () => {
    expect(await lookupRppPort("a.test", { fetch: doh({ Status: 3 }) })).toEqual({ port: 443, portFound: false, source: "default" });
    expect(await lookupRppPort("a.test", { fetch: doh({ Status: 0 }) })).toEqual({ port: 443, portFound: false, source: "default" });
    expect(await lookupRppPort("a.test", { fetch: doh({ Status: 0, Answer: [{ type: 65, data: "1 . alpn=h2" }] }) })).toEqual({ port: 443, portFound: false, source: "default" });
  });

  it("rejects when the lookup itself fails", async () => {
    await expect(lookupRppPort("a.test", { fetch: doh({ Status: 2 }) })).rejects.toThrow(/response code 2/);
    await expect(lookupRppPort("a.test", { fetch: doh({}, 500) })).rejects.toThrow(/500/);
  });
});
