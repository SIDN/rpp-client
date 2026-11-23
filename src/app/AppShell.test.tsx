// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import { DiscoveryContext } from "./discovery-context";
import { ConnectionProvider } from "./ConnectionProvider";
import { Providers } from "./providers";
import { createTestRouter } from "./router";

const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};

const { snapshot } = parseDiscoveryDocument(
  {
    "@type": "discovery",
    versions: [{ version: "1.0", baseUrl: "https://rpp.example.test/rpp" }],
    environment: { name: "test", status: "stable" },
    tlds: ["example"],
    presets: [{ id: "p", version: "1.0", defaultPreset: true, extensions: [] }],
    objects: ["domainName"],
    datetime: "2026-01-01T00:00:00Z",
  },
  SOURCE,
);

function renderAt(path: string, discovery: DiscoveryState = { status: "not-started" }) {
  return render(
    <Providers>
      <ConnectionProvider>
        <DiscoveryContext.Provider value={discovery}>
          <RouterProvider router={createTestRouter([path])} />
        </DiscoveryContext.Provider>
      </ConnectionProvider>
    </Providers>,
  );
}

describe("application shell", () => {
  it("has landmarks, a skip link and the connection status", () => {
    renderAt("/");
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("Not connected");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });

  it("routes to every screen of the menu, sets the title and moves focus to the content", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    fireEvent.click(within(nav).getByRole("link", { name: /Domain names/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Domain names" })).toBeInTheDocument();
    expect(document.title).toBe("Domain names - RPP Client");
    expect(screen.getByRole("main")).toHaveFocus();
    expect(within(nav).getByRole("link", { name: /Domain names/ })).toHaveAttribute("aria-current", "page");

    for (const label of ["Contacts", "Hosts", "Organisations", "Messages", "Processes", "Capabilities", "Exchanges", "Schemas", "Settings", "Connection"]) {
      fireEvent.click(screen.getByRole("link", { name: new RegExp(`^${label}`) }));
      expect(screen.getByRole("heading", { level: 1, name: label })).toBeInTheDocument();
    }
  });

  it("shows an address without a screen as not found", () => {
    renderAt("/nowhere");
    expect(screen.getByText("There is no screen at this address")).toBeInTheDocument();
    expect(document.title).toBe("Not found - RPP Client");
  });

  it("does not claim support before capabilities are read", () => {
    renderAt("/domains");
    expect(within(screen.getByRole("link", { name: /Domain names/ })).getByRole("img")).toHaveAccessibleName(/Not confirmed/);
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("marks what the server offers and what it does not, in the menu and on the screen", () => {
    renderAt("/contacts", { status: "ready", snapshot });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(within(nav).getByRole("link", { name: /Domain names/ })).getByRole("img")).toHaveAccessibleName("Offered by the server");
    expect(within(within(nav).getByRole("link", { name: /Contacts/ })).getByRole("img")).toHaveAccessibleName("Not offered by the server");
    expect(screen.getByRole("status")).toHaveTextContent("This server does not offer contacts");
    expect(screen.getByRole("banner")).toHaveTextContent("Capabilities confirmed");
    expect(screen.getByRole("banner")).toHaveTextContent("test, stable");
  });

  it("shows partial and failed discovery without hiding the reason", () => {
    const { unmount } = renderAt("/", { status: "partial", snapshot, warnings: ["a", "b"] });
    expect(screen.getByRole("banner")).toHaveTextContent("Capabilities partly confirmed");
    unmount();

    renderAt("/", { status: "failed", error: new Error("Discovery answered with HTTP status 500") as never });
    expect(screen.getByRole("banner")).toHaveTextContent("Discovery answered with HTTP status 500");
  });

  it("opens the menu on a narrow screen and closes it with Escape, returning focus to the button", () => {
    renderAt("/");
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("navigation", { name: "Primary" })).getAllByRole("link")[0]).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("closes the menu when a screen is chosen", () => {
    renderAt("/");
    const button = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name: /Hosts/ }));
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("collapses the sidebar to its icons, keeps every link reachable by name, and remembers the choice", () => {
    localStorage.clear();
    const { unmount, container } = renderAt("/", { status: "ready", snapshot });
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.style.getPropertyValue("--sidebar-width")).toBe("18rem");
    fireEvent.click(screen.getByRole("button", { name: "Collapse the sidebar" }));

    const expand = screen.getByRole("button", { name: "Expand the sidebar" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(shell.style.getPropertyValue("--sidebar-width")).toBe("4rem");
    const link = screen.getByRole("link", { name: /Domain names/ });
    expect(link).toHaveAttribute("title", "Domain names");
    expect(within(link).getByRole("img")).toHaveAccessibleName("Offered by the server");
    unmount();

    const again = renderAt("/");
    expect((again.container.firstElementChild as HTMLElement).style.getPropertyValue("--sidebar-width")).toBe("4rem");
    fireEvent.click(screen.getByRole("button", { name: "Expand the sidebar" }));
    expect((again.container.firstElementChild as HTMLElement).style.getPropertyValue("--sidebar-width")).toBe("18rem");
    localStorage.clear();
  });
});
