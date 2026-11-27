// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  describe("replay", () => {
    it("opens the request for editing, sends the change and shows the new exchange", async () => {
      const seen: { url: string; headers: Headers; body: unknown }[] = [];
      const session = createSession(PROFILE, { password: "hunter2" }, {
        fetch: async (input, init) => {
          seen.push({ url: String(input), headers: new Headers(init?.headers), body: init?.body });
          return rpp({ name: "example.test" });
        },
      });
      await session.transport.send({ method: "POST", target: "domainNames", body: { name: "example.test", authInfo: "s3cret" }, headers: { "X-Trace": "abc" } });
      renderPage(session);

      fireEvent.click(screen.getByRole("button", { name: "Replay request" }));
      const dialog = screen.getByRole("dialog", { name: "Replay request" });
      expect(within(dialog).getByText("Redacted values")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Path or address")).toHaveValue("domainNames");
      expect(within(dialog).getByLabelText("Extra headers")).toHaveValue("x-trace: abc");
      expect(within(dialog).getByLabelText(/^Send the credentials/)).toBeChecked();

      fireEvent.change(within(dialog).getByLabelText("Body"), { target: { value: '{"name":"other.test"}' } });
      fireEvent.change(within(dialog).getByLabelText("Extra headers"), { target: { value: "X-Trace: changed" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(seen).toHaveLength(2);
      expect(seen[1]?.body).toBe('{"name":"other.test"}');
      expect(seen[1]?.headers.get("x-trace")).toBe("changed");
      expect(seen[1]?.headers.get("authorization")).toMatch(/^Basic /);
      expect(session.exchanges.entries()).toHaveLength(2);
      const rows = within(screen.getByRole("list", { name: "Exchanges" })).getAllByRole("button");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveAttribute("aria-current", "true");
      expect(screen.getByLabelText("Request body, formatted")).toHaveTextContent('"other.test"');
    });

    it("keeps the dialog open with the reason when the request cannot be sent", async () => {
      const session = newSession(() => rpp({}));
      await session.transport.send({ method: "GET", target: "domainNames/example.test" });
      renderPage(session);

      fireEvent.click(screen.getByRole("button", { name: "Replay request" }));
      const dialog = screen.getByRole("dialog", { name: "Replay request" });
      fireEvent.change(within(dialog).getByLabelText("Body"), { target: { value: "{not json" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
      expect(await within(dialog).findByText(/The body is not valid JSON/)).toBeInTheDocument();
      expect(session.exchanges.entries()).toHaveLength(1);

      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
