// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS, type ConnectionProfile } from "@/config/connectionProfile";
import { AccountMenu } from "./AccountMenu";
import { ConnectionContext, type ConnectionApi } from "./connection-context";

const BASIC: ConnectionProfile = { baseUrl: "https://rpp.example.test", allowInsecureHttp: false, auth: { type: "basic", username: "jane", organisation: "ORG-1" }, preset: DEFAULT_PRESET_SETTINGS };

function renderMenu(profile: ConnectionProfile | undefined) {
  const disconnect = vi.fn();
  const api = { session: profile ? ({ profile } as Session) : undefined, disconnect } as unknown as ConnectionApi;
  render(
    <ConnectionContext.Provider value={api}>
      <MemoryRouter initialEntries={["/domains"]}>
        <AccountMenu />
        <Routes>
          <Route path="/domains" element={<h1>Domains</h1>} />
          <Route path="/client" element={<h1>Client</h1>} />
          <Route path="/connection" element={<h1>Connection</h1>} />
        </Routes>
      </MemoryRouter>
    </ConnectionContext.Provider>,
  );
  return { disconnect, button: screen.getByRole("button", { name: "Account" }) };
}

describe("account menu", () => {
  it("opens a menu with the user name and organisation, and focuses its first item", () => {
    const { button } = renderMenu(BASIC);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("account-identity")).toHaveTextContent("jane");
    expect(screen.getByTestId("account-identity")).toHaveTextContent("Organisation ORG-1");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Client settings", "Log out"]);
    expect(screen.getByRole("menuitem", { name: "Client settings" })).toHaveFocus();
  });

  it("moves with the arrow keys and closes with Escape, returning focus to the button", () => {
    const { button } = renderMenu(BASIC);
    fireEvent.keyDown(button, { key: "ArrowDown" });
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Log out" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Client settings" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("closes when clicked outside", () => {
    const { button } = renderMenu(BASIC);
    fireEvent.click(button);
    fireEvent.pointerDown(screen.getByRole("heading", { name: "Domains" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens the client settings", () => {
    const { button } = renderMenu(BASIC);
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name: "Client settings" }));
    expect(screen.getByRole("heading", { name: "Client" })).toBeInTheDocument();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("logs out by ending the connection and going to the Connection screen", () => {
    const { button, disconnect } = renderMenu(BASIC);
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));
    expect(disconnect).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Connection" })).toBeInTheDocument();
  });

  it("says when the connection has no user, and still offers to log out", () => {
    renderMenu({ ...BASIC, auth: { type: "none" } });
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByTestId("account-identity")).toHaveTextContent("No userConnected without authentication");
    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
  });

  it("only offers the settings while disconnected", () => {
    renderMenu(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByTestId("account-identity")).toHaveTextContent("Not connected");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Client settings"]);
  });
});
