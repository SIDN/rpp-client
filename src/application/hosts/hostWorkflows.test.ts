import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "@/rpp/client/FetchTransport";
import { RppError } from "@/rpp/errors/RppError";
import { createRppClient } from "@/rpp/operations/RppClient";
import { createBody, createHostWorkflows, parseHostName } from "./hostWorkflows";

const BASE = "https://rpp.example.test/rpp";
const HOST = { "@type": "host", hostName: "ns1.example.test", provMetadata: { "@type": "provMetadata", spClientId: "X" }, status: [] };

function setup(body: unknown = HOST, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(
    async (_input, init) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/rpp+json" }), "RPP-Cltrid": new Headers(init?.headers).get("RPP-Cltrid") ?? "", "RPP-Code": "01000" },
      }),
  );
  const workflows = createHostWorkflows(createRppClient({ transport: createFetchTransport({ baseUrl: BASE, fetch: fetchMock }) }));
  const last = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
    return {
      method: init?.method,
      path: `${(url as URL).pathname}${(url as URL).search}`,
      body: init?.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown),
    };
  };
  return { workflows, last, fetchMock };
}

describe("host name", () => {
  it("loses its surrounding whitespace, and a Unicode name is sent as its A-label", () => {
    expect(parseHostName("  ns1.example.test ")).toEqual({ name: "ns1.example.test", unicode: undefined });
    expect(parseHostName("ns.bücher.test")).toEqual({ name: "ns.xn--bcher-kva.test", unicode: "ns.bücher.test" });
    expect(() => parseHostName("  ")).toThrow(RppError);
  });

  it("is refused before anything is sent when empty", async () => {
    const { workflows, fetchMock } = setup();
    await expect(workflows.info("")).rejects.toBeInstanceOf(RppError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("check, lookup and create", () => {
  it("checks the name with GET", async () => {
    const { workflows, last } = setup({ "@type": "hostAvailability", available: true });
    expect((await workflows.check("ns1.example.test")).available).toBe(true);
    expect(last()).toMatchObject({ method: "GET", path: "/rpp/hosts/ns1.example.test/availability" });
  });

  it("looks a host up by its A-label", async () => {
    const { workflows, last } = setup();
    await workflows.info("ns.bücher.test");
    expect(last()).toMatchObject({ method: "GET", path: "/rpp/hosts/ns.xn--bcher-kva.test" });
  });

  it("creates with POST: the ns record of the host, and a record for each address", async () => {
    const { workflows, last } = setup(HOST, 201);
    await workflows.create({ name: "ns1.example.test", addresses: ["192.0.2.1", " 2001:db8::1 ", "192.0.2.1", ""] });
    expect(last()).toMatchObject({
      method: "POST",
      path: "/rpp/hosts",
      body: {
        "@type": "host",
        hostName: "ns1.example.test",
        dns: {
          "@type": "dnsData",
          records: [
            { "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns1.example.test." } },
            { "@type": "dnsRecord", name: "ns1.example.test.", type: "a", rdata: { address: "192.0.2.1" } },
            { "@type": "dnsRecord", name: "ns1.example.test.", type: "aaaa", rdata: { address: "2001:db8::1" } },
          ],
        },
      },
    });
  });

  it("creates a host without addresses with its ns record alone, and refuses what is not an address", () => {
    expect(createBody({ name: "ns1.example.net" }).dns?.records).toEqual([{ "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns1.example.net." } }]);
    expect(() => createBody({ name: "ns1.example.test", addresses: ["not an address"] })).toThrow(RppError);
  });
});

describe("change and delete", () => {
  it("patches with the operations given", async () => {
    const { workflows, last } = setup();
    await workflows.change("ns1.example.test", [{ op: "replace", path: "/hostName", value: "ns2.example.test" }]);
    expect(last()).toMatchObject({ method: "PATCH", path: "/rpp/hosts/ns1.example.test", body: [{ op: "replace", path: "/hostName", value: "ns2.example.test" }] });
  });

  it("deletes with DELETE and no body", async () => {
    const { workflows, last } = setup(undefined);
    await workflows.remove("ns1.example.test");
    expect(last()).toMatchObject({ method: "DELETE", path: "/rpp/hosts/ns1.example.test", body: undefined });
  });
});
