// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { DiscoveryContext } from "@/app/discovery-context";
import { Providers } from "@/app/providers";
import { resolvePreset } from "@/application/connection/preset";
import { createSession } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import { HostsPage } from "./HostsPage";

const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS, updateMode: "partial" } as const;

const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};

const discoveryWith = (objects: string[]): DiscoveryState => ({
  status: "ready",
  snapshot: parseDiscoveryDocument(
    {
      "@type": "discovery",
      versions: [{ version: "1.0", baseUrl: PROFILE.baseUrl }],
      environment: { name: "test", status: "stable" },
      tlds: ["test"],
      presets: [{ id: "p", version: "1.0", defaultPreset: true, extensions: [] }],
      objects,
      datetime: "2026-01-01T00:00:00Z",
    },
    SOURCE,
  ).snapshot,
});

const HOST = {
  "@type": "host",
  hostName: "ns1.example.test",
  provMetadata: { "@type": "provMetadata", spClientId: "REG-1", crDate: "2024-01-01T00:00:00Z" },
  status: [{ "@type": "hostStatus", label: "ok" }, { "@type": "hostStatus", label: "linked" }],
  dns: {
    "@type": "dnsData",
    records: [
      { "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns1.example.test." } },
      { "@type": "dnsRecord", name: "ns1.example.test.", type: "a", rdata: { address: "192.0.2.1" } },
      { "@type": "dnsRecord", name: "ns1.example.test.", type: "aaaa", rdata: { address: "2001:db8::1" } },
    ],
  },
  weird: { extra: true },
};

type Responder = (request: { method: string; path: string; body: unknown }) => Response | Promise<Response>;

const answer = (body: unknown, init: { status?: number; code?: string } = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/rpp+json" }), "RPP-Code": init.code ?? "01000", "RPP-Svtrid": "S-7" },
  });

function renderPage(responder: Responder, discovery: DiscoveryState = discoveryWith(["host"]), entry = "/") {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const session = createSession(PROFILE, undefined, {
    fetch: async (input, init) => {
      const url = input as URL;
      const request = {
        method: init?.method ?? "GET",
        path: `${url.pathname}${url.search}`.replace("/rpp", ""),
        body: init?.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown),
      };
      calls.push(request);
      return responder(request);
    },
  });
  const snapshot = discovery.status === "ready" ? discovery.snapshot : undefined;
  render(
    <Providers>
      <MemoryRouter initialEntries={[entry]}>
        <ConnectionContext.Provider value={{ session, resolvedPreset: resolvePreset(DEFAULT_PRESET_SETTINGS, snapshot) } as ConnectionApi}>
          <DiscoveryContext.Provider value={discovery}>
            <HostsPage />
          </DiscoveryContext.Provider>
        </ConnectionContext.Provider>
      </MemoryRouter>
    </Providers>,
  );
  return { calls };
}

const panel = () => within(screen.getByRole("tabpanel"));
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const typeName = (value: string) => fireEvent.change(panel().getByLabelText("Host name"), { target: { value } });
const press = (name: string) => fireEvent.click(panel().getByRole("button", { name }));

describe("a link to a host", () => {
  it("opens the info of the host and asks the registry for it at once", async () => {
    const { calls } = renderPage(() => answer(HOST), discoveryWith(["host"]), "/hosts?tab=info&name=ns1.example.test&run=1");
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "GET", path: "/hosts/ns1.example.test" });
    expect(panel().getByLabelText("Host name")).toHaveValue("ns1.example.test");
    expect(await panel().findByText("Found ns1.example.test")).toBeInTheDocument();
  });

  it("only fills in the name without the run flag", () => {
    const { calls } = renderPage(() => answer(HOST), discoveryWith(["host"]), "/hosts?tab=info&name=ns1.example.test");
    expect(panel().getByLabelText("Host name")).toHaveValue("ns1.example.test");
    expect(calls).toHaveLength(0);
  });
});

describe("hosts screen", () => {
  it("waits for a connection, and says so when the server has no hosts", () => {
    renderPage(() => answer({}), { status: "not-started" });
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("says so when the server has no hosts", () => {
    renderPage(() => answer({}), discoveryWith(["domainName"]));
    expect(screen.getByRole("status")).toHaveTextContent("This server does not offer hosts");
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("has a tab for each workflow the proxy implements", () => {
    renderPage(() => answer({}));
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Info", "Check", "Create", "Change", "Delete"]);
  });

  it("looks a host up by its A-label and shows its addresses, records and what it does not model", async () => {
    const { calls } = renderPage(() => answer(HOST));
    typeName(" ns1.example.test ");
    press("Get info");
    await waitFor(() => expect(panel().getByText("Found ns1.example.test")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "GET", path: "/hosts/ns1.example.test" });

    const view = panel();
    expect(view.getByRole("list", { name: "Status" })).toHaveTextContent("linked");
    const dt = (term: string) => view.getByText(term, { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(dt("IPv4 addresses")).toHaveTextContent("192.0.2.1");
    expect(dt("IPv4 addresses")).not.toHaveTextContent("2001:db8::1");
    expect(dt("IPv6 addresses")).toHaveTextContent("2001:db8::1");
    expect(within(view.getByRole("table", { name: "DNS records" })).getAllByRole("row")).toHaveLength(4);
    expect(view.getByText("REG-1")).toBeInTheDocument();
    expect(view.getByText("weird")).toBeInTheDocument();
  });

  it("explains a refusal with the registry's own reason", async () => {
    renderPage(() =>
      new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "Not Found", errors: [{ type: "t", result: "02303", reason: "No such host" }] }), {
        status: 404,
        headers: { "Content-Type": "application/problem+json", "RPP-Code": "02303" },
      }),
    );
    typeName("nope.example.test");
    press("Get info");
    expect(await panel().findByRole("alert")).toHaveTextContent("No such host");
  });
});

describe("check and create", () => {
  it("checks the name and moves on to creating", async () => {
    const { calls } = renderPage(() => answer({ "@type": "hostAvailability", available: true }));
    openTab("Check");
    typeName("ns2.example.test");
    press("Check availability");
    await waitFor(() => expect(panel().getByText("Available")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "GET", path: "/hosts/ns2.example.test/availability" });
    press("Create this host");
    expect(screen.getByRole("tab", { name: "Create" })).toHaveAttribute("aria-selected", "true");
    expect(panel().getByLabelText("Host name")).toHaveValue("ns2.example.test");
  });

  it("creates a host with its ns record and a record for each address", async () => {
    const { calls } = renderPage(() => answer(HOST, { status: 201 }));
    openTab("Create");
    typeName("ns1.example.test");
    press("Add an IP address");
    press("Add an IP address");
    fireEvent.change(panel().getByLabelText("IP address 1"), { target: { value: "192.0.2.1" } });
    fireEvent.change(panel().getByLabelText("IP address 2"), { target: { value: "2001:db8::1" } });
    press("Create host");

    await waitFor(() => expect(panel().getByText("Created ns1.example.test")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/hosts",
      body: {
        "@type": "host",
        hostName: "ns1.example.test",
        dns: {
          records: [
            { type: "ns", name: "@", rdata: { nsdname: "ns1.example.test." } },
            { type: "a", name: "ns1.example.test.", rdata: { address: "192.0.2.1" } },
            { type: "aaaa", name: "ns1.example.test.", rdata: { address: "2001:db8::1" } },
          ],
        },
      },
    });
  });

  it("creates a host without addresses, and drops an address that was added and removed", async () => {
    const { calls } = renderPage(() => answer(HOST, { status: 201 }));
    openTab("Create");
    typeName("ns1.example.net");
    press("Add an IP address");
    press("Remove IP address 1");
    press("Create host");
    await waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0]!.body as { dns: { records: unknown[] } }).dns.records).toHaveLength(1);
  });

  it("flags an address that is not an IP address, before sending", async () => {
    const { calls } = renderPage(() => answer(HOST, { status: 201 }));
    openTab("Create");
    typeName("ns1.example.test");
    press("Add an IP address");
    fireEvent.change(panel().getByLabelText("IP address 1"), { target: { value: "192.0.2.256" } });
    press("Create host");
    expect(await panel().findByText("Enter an IPv4 or IPv6 address")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("does not send a host without a name", async () => {
    const { calls } = renderPage(() => answer(HOST, { status: 201 }));
    openTab("Create");
    press("Create host");
    expect(await panel().findByRole("alert")).toHaveTextContent("Enter a host name");
    expect(calls).toHaveLength(0);
  });
});

describe("change", () => {
  const RENAMED = { ...HOST, hostName: "ns9.example.test" };

  it("loads the host, shows what will be sent and sends only that", async () => {
    const changed = { ...HOST, status: [...HOST.status, { "@type": "hostStatus", label: "clientUpdateProhibited" }] };
    const { calls } = renderPage((request) => (request.method === "PATCH" ? answer(changed) : answer(HOST)));
    openTab("Change");
    typeName("ns1.example.test");
    expect(panel().getByText("Load the host to change it")).toBeInTheDocument();
    press("Load the host");
    await waitFor(() => expect(panel().getByLabelText("IP address 1")).toHaveValue("192.0.2.1"));
    expect(panel().getByLabelText("IP address 2")).toHaveValue("2001:db8::1");
    expect(panel().getByLabelText("New host name")).toHaveValue("");

    const save = panel().getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    fireEvent.change(panel().getByLabelText("IP address 1"), { target: { value: "192.0.2.7" } });
    press("Add an IP address");
    fireEvent.change(panel().getByLabelText("IP address 3"), { target: { value: "2001:db8::7" } });
    fireEvent.click(panel().getByRole("checkbox", { name: "clientUpdateProhibited" }));
    await waitFor(() => expect(save).toBeEnabled());
    const summary = panel().getByRole("region", { name: "Changes to send" });
    expect(summary).toHaveTextContent("Remove the address 192.0.2.1");
    expect(summary).toHaveTextContent("Add the address 192.0.2.7");
    expect(summary).toHaveTextContent("Add the address 2001:db8::7");
    expect(summary).toHaveTextContent("Add status clientUpdateProhibited");

    fireEvent.click(save);
    await waitFor(() => expect(panel().getByText("Changed ns1.example.test")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({
      method: "PATCH",
      path: "/hosts/ns1.example.test",
      body: [
        { op: "remove", path: "/dns/records", match: { type: "a", rdata: { address: "192.0.2.1" } } },
        { op: "add", path: "/dns/records", value: { type: "a", name: "ns1.example.test.", rdata: { address: "192.0.2.7" } } },
        { op: "add", path: "/dns/records", value: { type: "aaaa", name: "ns1.example.test.", rdata: { address: "2001:db8::7" } } },
        { op: "add", path: "/status", value: { label: "clientUpdateProhibited" } },
      ],
    });
  });

  it("renames the host and follows it to its new name", async () => {
    const { calls } = renderPage((request) => (request.method === "PATCH" ? answer(RENAMED) : answer(HOST)));
    openTab("Change");
    typeName("ns1.example.test");
    press("Load the host");
    await waitFor(() => expect(panel().getByLabelText("New host name")).toBeInTheDocument());
    fireEvent.change(panel().getByLabelText("New host name"), { target: { value: "ns9.example.test" } });
    await waitFor(() => expect(panel().getByRole("region", { name: "Changes to send" })).toHaveTextContent("Rename the host to ns9.example.test"));
    fireEvent.click(panel().getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(calls.at(-1)).toMatchObject({ method: "PATCH", body: [{ op: "replace", path: "/hostName", value: "ns9.example.test" }] }));
    await waitFor(() => expect(panel().getByLabelText("Host name")).toHaveValue("ns9.example.test"));
    await waitFor(() => expect(panel().getByRole("heading", { name: "Change ns9.example.test" })).toBeInTheDocument());
  });
});

describe("delete", () => {
  it("needs the name typed before it deletes", async () => {
    const { calls } = renderPage(() => answer(undefined));
    openTab("Delete");
    typeName("ns1.example.test");
    press("Delete this host");
    const confirm = panel().getByRole("group", { name: "Delete ns1.example.test?" });
    const button = within(confirm).getByRole("button", { name: "Delete ns1.example.test" });
    expect(button).toBeDisabled();
    fireEvent.change(within(confirm).getByLabelText(/Type/), { target: { value: "ns1.example.test" } });
    fireEvent.click(button);
    await waitFor(() => expect(panel().getByText("Deleted ns1.example.test")).toBeInTheDocument());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/hosts/ns1.example.test" });
  });
});
