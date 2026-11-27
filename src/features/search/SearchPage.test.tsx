// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { DiscoveryContext } from "@/app/discovery-context";
import { resolvePreset } from "@/application/connection/preset";
import { createSession } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import { SearchPage } from "./SearchPage";

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
      objects: ["domainName", "contact", "host"],
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

function renderPage(responder: (call: Call) => Response) {
  const calls: Call[] = [];
  const session = createSession(PROFILE, undefined, {
    fetch: async (input, init) => {
      const url = input as URL;
      const call = { method: init?.method ?? "GET", path: url.pathname.replace("/rpp", ""), body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
      calls.push(call);
      return responder(call);
    },
  });
  const snapshot = DISCOVERY.status === "ready" ? DISCOVERY.snapshot : undefined;
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ConnectionContext.Provider value={{ session, resolvedPreset: resolvePreset(DEFAULT_PRESET_SETTINGS, snapshot) } as ConnectionApi}>
          <DiscoveryContext.Provider value={DISCOVERY}>
            <SearchPage />
          </DiscoveryContext.Provider>
        </ConnectionContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { calls };
}

const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("SearchPage", () => {
  it("builds a query, shows it live, sends it with QUERY and shows synthesized domain names", async () => {
    const { calls } = renderPage(() => answer({ results: [] }));

    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    change("Element of condition 1", "name");
    change("Operator of condition 1", "sw");
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(screen.getByText("Enter a value.")).toBeTruthy();
    change("Value of condition 1", "exa");

    // Operators follow the element: no ordering on a name, no substring on a date.
    const operators = within(screen.getByLabelText("Operator of condition 1")).getAllByRole("option").map((option) => option.getAttribute("value"));
    expect(operators).toEqual(["eq", "ne", "in", "pr", "sw", "co"]);

    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    change("Element of condition 2", "expiryDate");
    change("Operator of condition 2", "gt");
    const date = screen.getByLabelText("Value of condition 2");
    expect(date).toHaveAttribute("type", "date");
    change("Value of condition 2", "2026-06-01");
    fireEvent.click(screen.getByLabelText("Match any condition (or)"));
    const pageSizes = within(screen.getByLabelText("Results per page")).getAllByRole("option").map((option) => option.textContent);
    expect(pageSizes).toEqual(["25", "50", "100", "200"]);
    change("Results per page", "100");

    expect(screen.queryByText(/Query Object sent with/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Show the query as JSON"));
    const expected = {
      filter: {
        or: [
          { element: "name", op: "sw", value: "exa" },
          { element: "expiryDate", op: "gt", value: "2026-06-01T00:00:00Z" },
        ],
      },
      limit: 100,
    };
    const json = screen.getByText(/Query Object sent with QUERY/).closest("aside");
    expect(JSON.parse(json?.querySelector("pre")?.textContent ?? "")).toEqual(expected);
    expect(within(json as HTMLElement).getByText("Matches the schema")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Synthesized results, not from the server");

    expect(calls).toEqual([{ method: "QUERY", path: "/domainNames", body: expected }]);
    expect(screen.getByText("The server answered with 0 results.")).toBeTruthy();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const link = within(within(row).getAllByRole("cell")[0]).getByRole("link");
      const name = link.textContent ?? "";
      expect(name).toMatch(/^name-\d+\.nl$|^exa/);
      expect(link.getAttribute("href")).toBe(`/domains?name=${encodeURIComponent(name)}&tab=info&run=1`);
    }
    expect(within(screen.getByRole("table")).queryByRole("columnheader", { name: "Registrar" })).toBeNull();
  });

  it("shows the failure of a server without search, and still the synthesized results of the chosen type", async () => {
    const problem = { type: "urn:ietf:params:rpp:error", title: "Not Implemented", errors: [{ type: "t", result: "02101", reason: "Unimplemented command" }] };
    const { calls } = renderPage(() => answer(problem, 501));

    change("Search in", "host");
    fireEvent.click(screen.getByLabelText(/^linked/));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await screen.findByText("Synthesized results, not from the server");
    expect(calls).toEqual([{ method: "QUERY", path: "/hosts", body: { limit: 25, includeElements: ["linked"] } }]);
    expect(screen.getAllByText(/Unimplemented command/).length).toBeGreaterThan(0);
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual(["Host name", "Addresses", "Status", "linked", "Created"]);
    const link = within(screen.getByRole("table")).getAllByRole("link")[0];
    expect(link.getAttribute("href")).toMatch(/^\/hosts\?name=ns[12]\.name-\d+\.nl&tab=info&run=1$/);
  });

  it("shows contacts with only their identifier, status and creation date", async () => {
    renderPage(() => answer({ results: [] }));
    change("Search in", "contact");
    fireEvent.click(screen.getByLabelText(/^linked/));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Synthesized results, not from the server");
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual(["Identifier", "Status", "Created"]);
  });

  it("clears the conditions when another object type is chosen", async () => {
    renderPage(() => answer({ results: [] }));
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    expect(screen.getByLabelText("Element of condition 1")).toBeTruthy();
    change("Search in", "contact");
    await waitFor(() => expect(screen.queryByLabelText("Element of condition 1")).toBeNull());
  });
});
