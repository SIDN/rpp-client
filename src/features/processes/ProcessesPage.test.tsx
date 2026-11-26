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
import { seenKey } from "../shared/seenObjects";
import { ProcessesPage } from "./ProcessesPage";

const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS, updateMode: "partial" } as const;

const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};

const DISCOVERY: DiscoveryState = {
  status: "ready",
  snapshot: parseDiscoveryDocument(
    {
      "@type": "discovery",
      versions: [{ version: "1.0", baseUrl: PROFILE.baseUrl }],
      environment: { name: "test", status: "stable" },
      tlds: ["test"],
      presets: [{ id: "p", version: "1.0", defaultPreset: true, extensions: [] }],
      objects: ["domainName", "contact"],
      datetime: "2026-01-01T00:00:00Z",
    },
    SOURCE,
  ).snapshot,
};

type Call = { method: string; path: string };
type Responder = (request: Call) => Response;

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/rpp+json", "RPP-Code": status === 200 ? "01000" : "02000", "RPP-Svtrid": "S-7" } });

const transferOf = (status: string, day: number) => ({ "@type": "domainTransferProcess", trStatus: status, requestDate: `2026-01-${String(day).padStart(2, "0")}T00:00:00Z` });

function renderPage(seed: (store: (type: "domainName" | "contact" | "host", id: string, data: unknown) => void) => void, responder: Responder = () => answer({})) {
  const calls: Call[] = [];
  const session = createSession(PROFILE, undefined, {
    fetch: async (input, init) => {
      const url = input as URL;
      const call = { method: init?.method ?? "GET", path: `${url.pathname}${url.search}`.replace("/rpp", "") };
      calls.push(call);
      return responder(call);
    },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  seed((type, id, data) => queryClient.setQueryData(seenKey(type, session.id, id), data));
  const snapshot = DISCOVERY.status === "ready" ? DISCOVERY.snapshot : undefined;
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConnectionContext.Provider value={{ session, resolvedPreset: resolvePreset(DEFAULT_PRESET_SETTINGS, snapshot) } as ConnectionApi}>
          <DiscoveryContext.Provider value={DISCOVERY}>
            <ProcessesPage />
          </DiscoveryContext.Provider>
        </ConnectionContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { calls, queryClient, session };
}

const dataRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
const inTable = () => within(screen.getByRole("table"));
const settled = () => waitFor(() => expect(screen.queryByText(/Reading the status of/)).toBeNull());
const choose = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

const domainWith = (processes: unknown) => ({ "@type": "domain", domainName: "example.test", processes });
const contactWith = (processes: unknown) => ({ "@type": "contact", contactId: "C-1", processes });

const PROCESSES = {
  transferProcess: [{ processId: "T1" }, { processId: "T2" }],
  restoreProcess: [{ processId: "R1" }],
  renewProcess: [{ processId: "N1" }],
};

function respond({ method, path }: Call): Response {
  if (method !== "GET") return answer({}, 405);
  if (path === "/domainNames/example.test/processes/transferProcesses/T1") return answer(transferOf("pending", 3));
  if (path === "/domainNames/example.test/processes/transferProcesses/T2") return answer(transferOf("serverApproved", 2));
  if (path === "/domainNames/example.test/processes/restoreProcesses/R1") return answer({ "@type": "domainRestoreProcess", restoreStatus: "pendingRestore", requestDate: "2026-01-04T00:00:00Z" });
  if (path === "/contacts/C-1/processes/transferProcesses/T9") return answer({ "@type": "contactTransferProcess", trStatus: "pending", requestDate: "2026-01-05T00:00:00Z" });
  return answer({}, 404);
}

describe("processes screen", () => {
  it("waits for a connection", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ConnectionContext.Provider value={{ session: undefined } as ConnectionApi}>
            <DiscoveryContext.Provider value={{ status: "not-started" }}>
              <ProcessesPage />
            </DiscoveryContext.Provider>
          </ConnectionContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("says that nothing is seen yet", () => {
    renderPage(() => undefined);
    expect(screen.getByText("No objects seen yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read again" })).toBeDisabled();
  });

  it("says so when the objects have no processes", () => {
    renderPage((store) => store("domainName", "example.test", domainWith({})));
    expect(screen.getByText("These objects have no processes")).toBeInTheDocument();
  });

  it("lists the processes of the objects seen, reads those it can, and shows the others as such", async () => {
    const { calls } = renderPage((store) => {
      store("domainName", "example.test", domainWith(PROCESSES));
      store("contact", "C-1", contactWith({ transferProcess: [{ processId: "T9" }] }));
    }, respond);

    await waitFor(() => expect(screen.getAllByText("pending")).toHaveLength(3));
    const rows = dataRows();
    expect(rows).toHaveLength(5);
    // newest request first
    expect(rows.map((row) => within(row).getAllByRole("cell")[2]?.textContent)).toEqual(["T9", "R1", "T1", "T2", "N1"]);
    expect(within(rows[4]!).getByText("Cannot be read")).toBeInTheDocument();
    expect(calls.map((call) => call.path)).not.toContain("/domainNames/example.test/processes/renewProcesses/N1");
  });

  it("filters on object type, process type and status", async () => {
    renderPage((store) => {
      store("domainName", "example.test", domainWith(PROCESSES));
      store("contact", "C-1", contactWith({ transferProcess: [{ processId: "T9" }] }));
    }, respond);
    await waitFor(() => expect(screen.getAllByText("pending")).toHaveLength(3));

    choose("Object type", "domainName");
    choose("Process type", "transfer");
    choose("Status", "active");
    expect(dataRows().map((row) => within(row).getAllByRole("cell")[2]?.textContent)).toEqual(["T1"]);

    choose("Status", "serverApproved");
    expect(dataRows().map((row) => within(row).getAllByRole("cell")[2]?.textContent)).toEqual(["T2"]);

    choose("Object type", "contact");
    expect(screen.getByText("No process matches")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(dataRows()).toHaveLength(5);
  });

  it("drops a status that the chosen process type does not have", async () => {
    renderPage((store) => store("domainName", "example.test", domainWith(PROCESSES)), respond);
    await waitFor(() => expect(screen.getAllByText("pending")).toHaveLength(2));
    choose("Status", "restored");
    choose("Process type", "transfer");
    expect(screen.getByLabelText("Status")).toHaveValue("all");
    expect(dataRows()).toHaveLength(2);
  });

  describe("paging", () => {
    const many = { transferProcess: Array.from({ length: 60 }, (_, index) => ({ processId: `P${String(index + 1).padStart(2, "0")}` })) };
    const respondMany = ({ path }: Call) => answer(transferOf("pending", Number(path.slice(-2)) % 28 + 1));

    it("shows 25 results per page unless told otherwise, and moves between the pages", async () => {
      renderPage((store) => store("domainName", "example.test", domainWith(many)), respondMany);
      await settled();

      expect(screen.getByLabelText("Results per page")).toHaveValue("25");
      expect(dataRows()).toHaveLength(25);
      expect(screen.getByText("Showing 1–25 of 60")).toBeInTheDocument();
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(dataRows()).toHaveLength(10);
      expect(screen.getByText("Showing 51–60 of 60")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Previous" }));
      expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    });

    it("offers other page sizes and starts again at the first page when one is chosen", async () => {
      renderPage((store) => store("domainName", "example.test", domainWith(many)), respondMany);
      await settled();
      expect(within(screen.getByLabelText("Results per page")).getAllByRole("option").map((option) => option.textContent)).toEqual(["10", "25", "50", "100"]);

      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      choose("Results per page", "10");
      expect(dataRows()).toHaveLength(10);
      expect(screen.getByText("Showing 1–10 of 60")).toBeInTheDocument();
      expect(screen.getByText("Page 1 of 6")).toBeInTheDocument();

      choose("Results per page", "100");
      expect(dataRows()).toHaveLength(60);
      expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    });

    it("starts again at the first page when a filter changes", async () => {
      renderPage((store) => store("domainName", "example.test", domainWith(many)), respondMany);
      await settled();
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      choose("Status", "active");
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    });
  });

  it("shows a process that could not be read, and says why", async () => {
    renderPage((store) => store("domainName", "example.test", domainWith({ transferProcess: [{ processId: "GONE" }] })), () => answer({ "@type": "error", title: "No such process" }, 404));
    const failed = await screen.findByText("Could not be read");
    expect(failed.getAttribute("title")).toBeTruthy();
  });

  it("reads the objects again, puts the new answer in the cache and reads the processes again", async () => {
    let status = "pending";
    const { calls, queryClient, session } = renderPage((store) => store("domainName", "example.test", domainWith({ transferProcess: [{ processId: "T1" }] })), ({ path }) => {
      if (path === "/domainNames/example.test") return answer(domainWith({ transferProcess: [{ processId: "T1" }, { processId: "T3" }] }));
      if (path.endsWith("/T3")) return answer(transferOf("clientApproved", 9));
      return answer(transferOf(status, 3));
    });
    await inTable().findByText("pending");
    status = "serverApproved";
    fireEvent.click(screen.getByRole("button", { name: "Read again" }));

    await inTable().findByText("clientApproved");
    expect(calls.map((call) => call.path)).toContain("/domainNames/example.test");
    expect(queryClient.getQueryData(seenKey("domainName", session.id, "example.test"))).toMatchObject({ processes: { transferProcess: [{ processId: "T1" }, { processId: "T3" }] } });
    await inTable().findByText("serverApproved");
    expect(dataRows()).toHaveLength(2);
  });
});
