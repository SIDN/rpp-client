// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { DiscoveryContext } from "@/app/discovery-context";
import { SettingsContext } from "@/app/settings-context";
import { createSession, type Session } from "@/application/connection/session";
import { DEFAULT_SETTINGS } from "@/config/appSettings";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import { en } from "@/i18n/locales/en";
import { DashboardPage } from "./DashboardPage";

const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS } as const;

const DISCOVERY: DiscoveryState = {
  status: "ready",
  snapshot: parseDiscoveryDocument(
    {
      "@type": "discovery",
      versions: [{ version: "1.0", baseUrl: PROFILE.baseUrl }],
      environment: { name: "test", status: "stable" },
      tlds: ["nl"],
      presets: [{ id: "p", version: "1.0", defaultPreset: true, extensions: [] }],
      objects: ["domainName"],
      datetime: "2026-01-01T00:00:00Z",
    },
    {
      url: "https://rpp.example.test/.well-known/rpp",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      exchangeId: "x-1",
      correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
    },
  ).snapshot,
};

type Call = { method: string; path: string; body: unknown };

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": status < 300 ? "application/rpp+json" : "application/problem+json", "RPP-Code": status < 300 ? "01000" : "02101", "RPP-Svtrid": "S-7" },
  });

const DAY = 86400000;
const inDays = (days: number) => new Date(Date.now() + days * DAY + 60000).toISOString().replace(/\.\d{3}Z$/, "Z");

function renderPage({ synthesize, responder, connected = true }: { synthesize: boolean; responder?: (call: Call) => Response; connected?: boolean }) {
  const calls: Call[] = [];
  const session: Session | undefined = connected
    ? createSession(PROFILE, undefined, {
        fetch: async (input, init) => {
          const call = { method: init?.method ?? "GET", path: (input as URL).pathname.replace("/rpp", ""), body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
          calls.push(call);
          return (responder ?? (() => answer({ results: [] })))(call);
        },
      })
    : undefined;
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <SettingsContext.Provider value={{ settings: { ...DEFAULT_SETTINGS, synthesizeData: synthesize }, update: () => {} }}>
          <ConnectionContext.Provider value={{ session } as ConnectionApi}>
            <DiscoveryContext.Provider value={connected ? DISCOVERY : { status: "not-started" }}>
              <DashboardPage />
            </DiscoveryContext.Provider>
          </ConnectionContext.Provider>
        </SettingsContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { calls };
}

const section = (name: RegExp) => screen.getByRole("region", { name });

describe("DashboardPage", () => {
  it("shows synthesized domain names by default, marked as such, without asking the server", () => {
    const { calls } = renderPage({ synthesize: true });

    expect(screen.getByText("These domain names are synthesized")).toBeInTheDocument();
    const expiring = within(section(/Expiring in the next 30 days/)).getAllByRole("link");
    expect(expiring.length).toBeGreaterThan(10);
    expect(expiring[0].getAttribute("href")).toMatch(/^\/domains\?name=name-\d+\.nl&tab=renew$/);
    const transfers = within(section(/Pending transfers/)).getAllByRole("link");
    expect(transfers).toHaveLength(10);
    expect(transfers[0].getAttribute("href")).toMatch(/tab=transfer$/);
    expect(within(section(/In redemption/)).getAllByRole("link")[0].getAttribute("href")).toMatch(/tab=restore$/);
    expect(within(section(/In redemption/)).getByText("More domain names match than are shown here.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it.each([true, false])("asks to connect first when there is no connection (synthesized: %s)", (synthesize) => {
    const { calls } = renderPage({ synthesize, connected: false });
    expect(screen.getByText(en["common.notConnected.title"])).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en["ui.connection.setUp"] })).toHaveAttribute("href", "/connection");
    expect(screen.queryByRole("region", { name: /Pending transfers/ })).toBeNull();
    expect(screen.queryByText("These domain names are synthesized")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("otherwise sends a QUERY for each list and shows what the server answers", async () => {
    const { calls } = renderPage({
      synthesize: false,
      responder: (call) => {
        const filter = (call.body as { filter: { element?: string; value?: string } }).filter;
        if (filter.value === "pendingTransfer") {
          return answer({ results: [{ "@type": "domainName", name: "moving.nl", status: [{ "@type": "domainStatus", label: "pendingTransfer", due: inDays(3) }] }] });
        }
        if (filter.value === "rgpRedemptionPeriod") return answer({ results: [] });
        return answer({ results: [{ "@type": "domainName", name: "soon.nl", expiryDate: inDays(2) }], nextCursor: "next" });
      },
    });

    await waitFor(() => expect(within(section(/Pending transfers/)).getByRole("link", { name: /moving\.nl/ })).toBeInTheDocument());
    expect(within(section(/Pending transfers/)).getByText("in 3 days")).toBeInTheDocument();
    expect(within(section(/Expiring/)).getByRole("link", { name: /soon\.nl/ })).toHaveAttribute("href", "/domains?name=soon.nl&tab=renew");
    expect(within(section(/Expiring/)).getByText("More domain names match than are shown here.")).toBeInTheDocument();
    expect(within(section(/In redemption/)).getByText("No domain name is in redemption.")).toBeInTheDocument();
    expect(screen.queryByText("These domain names are synthesized")).toBeNull();

    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.method === "QUERY" && call.path === "/domainNames")).toBe(true);
    const expiry = calls.find((call) => "and" in (call.body as { filter: object }).filter)?.body as { filter: { and: { element: string; op: string }[] }; sort: unknown };
    expect(expiry.filter.and.map(({ element, op }) => `${element} ${op}`)).toEqual(["expiryDate ge", "expiryDate le"]);
    expect(expiry.sort).toEqual([{ element: "expiryDate", direction: "asc" }]);
  });

  it("draws a busy day as a short stack with a count, and hatches the days after the last one shown", async () => {
    const busy = Array.from({ length: 25 }, (_, index) => ({ "@type": "domainName", name: `busy-${index}.nl`, expiryDate: inDays(index < 22 ? 1 : 3) }));
    renderPage({
      synthesize: false,
      responder: (call) => ("and" in (call.body as { filter: object }).filter ? answer({ results: busy, nextCursor: "next" }) : answer({ results: [] })),
    });

    await waitFor(() => expect(within(section(/Expiring/)).getByRole("link", { name: /busy-0\.nl/ })).toBeInTheDocument());
    const strip = section(/Expiring/).querySelector("[aria-hidden]") as HTMLElement;
    expect(strip.querySelectorAll("a")).toHaveLength(5 + 3);
    const count = within(strip).getByTestId("timeline-count");
    expect(count).toHaveTextContent("+17");
    expect(count.title).toContain("busy-21.nl");
    expect(within(strip).getByTestId("timeline-unknown")).toHaveTextContent("Not in these results");
  });

  it("shows why a list failed, and still shows the others", async () => {
    renderPage({
      synthesize: false,
      responder: (call) =>
        (call.body as { filter: { value?: string } }).filter.value === "rgpRedemptionPeriod"
          ? answer({ type: "about:blank", title: "Not implemented", status: 501 }, 501)
          : answer({ results: [] }),
    });

    await waitFor(() => expect(within(section(/In redemption/)).getByRole("alert")).toBeInTheDocument());
    expect(within(section(/Pending transfers/)).getByText("No transfer is pending.")).toBeInTheDocument();
  });
});
