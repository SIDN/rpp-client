// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DiscoveryContext } from "@/app/discovery-context";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { DiscoveryError } from "@/rpp/errors/DiscoveryError";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import { resolvePreset } from "@/application/connection/preset";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import { CapabilitiesPage } from "./CapabilitiesPage";
import { unmodelledMembers } from "./capabilityView";

const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};

const EXTENSION = { id: "secDNS", version: "1.0", name: "DNSSEC", url: "https://example.test/secdns" };

const DOCUMENT = {
  "@type": "discovery",
  versions: [{ version: "1.0", baseUrl: "https://elsewhere.example.test/rpp" }],
  environment: { name: "test", status: "stable" },
  tlds: ["example", "test"],
  presets: [
    { id: "planets", version: "1.0", name: "Planets", defaultPreset: true, extensions: [EXTENSION] },
    { id: "moons", version: "2.0", defaultPreset: false, extensions: [] },
  ],
  objects: ["domainName", "spaceship"],
  extensions: [EXTENSION],
  profiles: [{ id: "eu", version: "1.0" }],
  datetime: "2026-01-01T00:00:00Z",
  notices: ["maintenance on friday"],
};

function renderPage(state: DiscoveryState, document: unknown = DOCUMENT) {
  const { snapshot, warnings } = parseDiscoveryDocument(document, SOURCE);
  const discovery = state.status === "ready" ? { status: "ready" as const, snapshot } : state.status === "partial" ? { ...state, snapshot, warnings } : state;
  const api = {
    session: undefined,
    resolvedPreset: resolvePreset(DEFAULT_PRESET_SETTINGS, discovery.status === "ready" || discovery.status === "partial" ? discovery.snapshot : undefined),
  } as ConnectionApi;
  return render(
    <MemoryRouter>
      <ConnectionContext.Provider value={api}>
        <DiscoveryContext.Provider value={discovery}>
          <CapabilitiesPage />
        </DiscoveryContext.Provider>
      </ConnectionContext.Provider>
    </MemoryRouter>,
  );
}

describe("capabilities screen", () => {
  it("asks for a connection before discovery", () => {
    renderPage({ status: "not-started" });
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("says that reading is in progress", () => {
    renderPage({ status: "loading" });
    expect(screen.getByRole("status")).toHaveTextContent("Reading the capabilities");
  });

  it("shows a failure with its exchange", () => {
    renderPage({ status: "failed", error: new DiscoveryError("http", "The server answered 500", { status: 500, exchangeId: "x-7" }) });
    expect(screen.getByRole("alert")).toHaveTextContent("The server answered 500");
    expect(screen.getByRole("alert")).toHaveTextContent("x-7");
    expect(screen.getByRole("link", { name: "Go to the connection" })).toHaveAttribute("href", "/connection");
  });

  it("shows what the server offers, as received", () => {
    renderPage({ status: "ready", snapshot: undefined as never });
    expect(screen.getByText("test, stable")).toBeInTheDocument();
    expect(screen.getByText("example, test")).toBeInTheDocument();

    const objects = screen.getByRole("region", { name: "Objects" });
    expect(within(objects).getByText("domainName")).toBeInTheDocument();
    expect(objects).toHaveTextContent("spaceship");
    expect(objects).toHaveTextContent("not known to this client");

    const versions = screen.getByRole("region", { name: "Server" });
    expect(versions).toHaveTextContent("https://elsewhere.example.test/rpp");
    expect(versions).toHaveTextContent("other origin, not followed");

    const planets = screen.getByRole("article", { name: "Preset planets 1.0" });
    expect(planets).toHaveTextContent("default");
    expect(planets).toHaveTextContent("sent with requests");
    expect(planets).toHaveTextContent("secDNS 1.0");
    expect(screen.getByRole("article", { name: "Preset moons 2.0" })).not.toHaveTextContent("sent with requests");

    const extensions = screen.getByRole("region", { name: "Extensions" });
    expect(extensions).toHaveTextContent("DNSSEC");
    expect(extensions).toHaveTextContent("not supported by this client");
    expect(extensions).toHaveTextContent("In preset: planets 1.0");
    expect(extensions.querySelector("a")).toBeNull();
  });

  it("lists remarks and members it does not interpret", () => {
    renderPage({ status: "partial", snapshot: undefined as never, warnings: [] }, { ...DOCUMENT, presets: [] });
    expect(screen.getAllByText(/remark\(s\)/).length).toBeGreaterThan(0);
    expect(screen.getByText("notices")).toBeInTheDocument();
    expect(screen.getByLabelText("Discovery document")).toHaveTextContent('"maintenance on friday"');
  });
});

describe("unmodelledMembers", () => {
  it("names what the document has besides what is interpreted", () => {
    expect(unmodelledMembers({ "@type": "discovery", tlds: [], links: [], idnLgr: {} })).toEqual(["links", "idnLgr"]);
    expect(unmodelledMembers("nope")).toEqual([]);
  });
});
