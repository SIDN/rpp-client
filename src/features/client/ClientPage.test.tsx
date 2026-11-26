// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsProvider } from "@/app/SettingsProvider";
import { createTestRouter } from "@/app/router";
import { RouterProvider } from "react-router-dom";
import { Providers } from "@/app/providers";
import { ConnectionProvider } from "@/app/ConnectionProvider";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import { ClientPage } from "./ClientPage";

const profile = (auth: object) => ({ baseUrl: "https://rpp.example/rpp", allowInsecureHttp: false, auth, preset: DEFAULT_PRESET_SETTINGS, updateMode: "partial" });
const bookmarks = [
  { id: "a", name: "Test registry", profile: profile({ type: "none" }) },
  { id: "b", name: "Production", profile: profile({ type: "basic", username: "reg" }) },
];

const stored = () => JSON.parse(localStorage.getItem("rpp-client.settings") ?? "{}") as Record<string, unknown>;

const renderPage = () =>
  render(
    <MemoryRouter>
      <SettingsProvider>
        <ClientPage />
      </SettingsProvider>
    </MemoryRouter>,
  );

describe("client screen", () => {
  beforeEach(() => localStorage.clear());

  it("says where to save a bookmark when there are none", () => {
    renderPage();
    expect(screen.getByRole("combobox", { name: "Default connection" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Connection screen" })).toHaveAttribute("href", "/connection");
    expect(screen.getByRole("checkbox", { name: /Connect when the client starts/ })).toBeDisabled();
  });

  it("chooses the default connection and keeps it", () => {
    localStorage.setItem("rpp-client.bookmarks", JSON.stringify(bookmarks));
    renderPage();
    fireEvent.change(screen.getByRole("combobox", { name: "Default connection" }), { target: { value: "a" } });
    expect(stored()).toMatchObject({ defaultBookmarkId: "a" });
    expect(screen.getByText("https://rpp.example/rpp")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Default connection" }), { target: { value: "" } });
    expect(stored().defaultBookmarkId).toBeUndefined();
  });

  it("warns that a connection with a password cannot be connected to by itself", () => {
    localStorage.setItem("rpp-client.bookmarks", JSON.stringify(bookmarks));
    renderPage();
    fireEvent.change(screen.getByRole("combobox", { name: "Default connection" }), { target: { value: "b" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Connect when the client starts/ }));
    expect(stored()).toMatchObject({ autoConnect: true });
    expect(screen.getByText("This connection needs a password")).toBeInTheDocument();
  });

  it("keeps the request timeout in seconds, and refuses one that is not a whole number in range", () => {
    renderPage();
    const field = screen.getByLabelText("Timeout (seconds)");
    expect(field).toHaveValue(5);
    fireEvent.change(field, { target: { value: "12" } });
    expect(stored()).toMatchObject({ requestTimeoutSeconds: 12 });
    fireEvent.change(field, { target: { value: "0" } });
    expect(screen.getByText(/Enter a whole number of seconds/)).toBeInTheDocument();
    expect(stored()).toMatchObject({ requestTimeoutSeconds: 12 });
    fireEvent.blur(field);
    expect(field).toHaveValue(12);
  });

  it("keeps the display options", () => {
    renderPage();
    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), { target: { value: "utc" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Messages shown to begin with" }), { target: { value: "50" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Processes per page" }), { target: { value: "10" } });
    expect(stored()).toMatchObject({ timeDisplay: "utc", messageLimit: 50, processPageSize: 10 });
  });
  it("chooses a colour scheme, applies it and keeps it", () => {
    renderPage();
    expect(screen.getByRole("radio", { name: /Teal and sodium/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Nord/ }));
    expect(document.documentElement.dataset.palette).toBe("nord");
    expect(localStorage.getItem("rpp-client.palette")).toBe("nord");
    expect(screen.getByRole("radio", { name: /Nord/ })).toBeChecked();
  });
});

describe("client icon", () => {
  beforeEach(() => localStorage.clear());

  it("is in the header and opens the client screen", async () => {
    render(
      <Providers>
        <SettingsProvider>
          <ConnectionProvider>
            <RouterProvider router={createTestRouter(["/"])} />
          </ConnectionProvider>
        </SettingsProvider>
      </Providers>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Client settings" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Client" })).toBeInTheDocument();
  });
});
