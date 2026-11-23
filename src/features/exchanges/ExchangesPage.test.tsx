// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { createSession, type Session } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import { ExchangesPage } from "./ExchangesPage";

const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "basic", username: "u" }, preset: DEFAULT_PRESET_SETTINGS } as const;

const rpp = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/rpp+json", "RPP-Code": "01000", "RPP-Svtrid": "S-9", ...init.headers },
  });

function newSession(respond: (url: string) => Response | Promise<Response>) {
  return createSession(PROFILE, { password: "hunter2" }, { fetch: async (input) => respond(String(input)) });
}

function renderPage(session: Session | undefined) {
  const api = { session } as ConnectionApi;
  return render(
    <MemoryRouter>
      <ConnectionContext.Provider value={api}>
        <ExchangesPage />
      </ConnectionContext.Provider>
    </MemoryRouter>,
  );
}

describe("exchanges screen", () => {
  it("asks for a connection when there is none", () => {
    renderPage(undefined);
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up a connection" })).toHaveAttribute("href", "/connection");
  });

  it("says so when nothing has been sent", () => {
    renderPage(newSession(() => rpp({})));
    expect(screen.getByText("Nothing has been sent yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
  });

  it("shows request and response details, newest first, with secrets removed", async () => {
    const session = newSession((url) =>
      url.endsWith("/missing") ? rpp({ title: "Not found" }, { status: 404, headers: { "RPP-Code": "02303" } }) : rpp({ name: "example.test", password: "hunter2" }),
    );
    await session.transport.send({ method: "GET", target: "domainNames/example.test" });
    await session.transport.send({ method: "POST", target: "domainNames/missing", body: { name: "x", authInfo: "s3cret" } });
    renderPage(session);

    const list = screen.getByRole("list", { name: "Exchanges" });
    const rows = within(list).getAllByRole("button");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("POST");
    expect(rows[0]).toHaveTextContent("404");
    expect(rows[0]).toHaveAttribute("aria-current", "true");

    expect(screen.getByRole("heading", { level: 2, name: /POST/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Request headers" })).toHaveTextContent("[REDACTED]");
    const requestBody = screen.getByLabelText("Request body, formatted");
    expect(requestBody).toHaveTextContent('"authInfo": "[REDACTED]"');
    expect(screen.getByLabelText("Response body, formatted")).toHaveTextContent('"title": "Not found"');
    expect(screen.getAllByText("02303").length).toBeGreaterThanOrEqual(1);
    expect(document.body.textContent).not.toContain("hunter2");
    expect(document.body.textContent).not.toContain("s3cret");

    fireEvent.click(rows[1] as HTMLElement);
    expect(screen.getByRole("heading", { level: 2, name: /GET/ })).toBeInTheDocument();
    expect(screen.getByText("The request has no body.")).toBeInTheDocument();
    expect(screen.getAllByText("S-9").length).toBeGreaterThanOrEqual(1);
  });

  it("shows why there was no response", async () => {
    const session = newSession(() => {
      throw new TypeError("Failed to fetch");
    });
    await session.transport.send({ method: "GET", target: "x" }).catch(() => undefined);
    renderPage(session);
    expect(screen.getByRole("alert")).toHaveTextContent("No response");
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to fetch");
  });

  it("filters, follows new exchanges and clears", async () => {
    const session = newSession(() => rpp({}));
    await session.transport.send({ method: "GET", target: "domainNames/a" });
    await session.transport.send({ method: "GET", target: "hosts/b" });
    renderPage(session);

    fireEvent.change(screen.getByLabelText("Filter"), { target: { value: "hosts" } });
    expect(within(screen.getByRole("list", { name: "Exchanges" })).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 exchange(s)");

    fireEvent.change(screen.getByLabelText("Filter"), { target: { value: "nothing like it" } });
    expect(screen.getByText("No exchange matches the filter")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter"), { target: { value: "" } });
    await act(async () => {
      await session.transport.send({ method: "GET", target: "contacts/c" });
    });
    expect(screen.getByRole("status")).toHaveTextContent("3 exchange(s)");
    expect(screen.getByRole("heading", { level: 2, name: /contacts\/c/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("Nothing has been sent yet")).toBeInTheDocument();
  });
});
