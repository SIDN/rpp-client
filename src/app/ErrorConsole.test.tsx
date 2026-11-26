// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createSession, type Session } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import { ConnectionContext, type ConnectionApi } from "./connection-context";
import { ErrorConsole } from "./ErrorConsole";

const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS, updateMode: "partial" } as const;

const problem = (title: string, result: string, reason: string, detail?: string) => ({
  type: "urn:ietf:params:rpp:error",
  title,
  ...(detail ? { detail } : {}),
  errors: [{ type: "t", result, reason, paths: ["$.name"] }],
});

function newSession(respond: (path: string) => Response | Promise<Response>): Session {
  return createSession(PROFILE, undefined, { fetch: async (input) => respond((input as URL).pathname.replace("/rpp", "")) });
}

const rendered = (session: Session | undefined) => (
  <MemoryRouter>
    <ConnectionContext.Provider value={{ session } as ConnectionApi}>
      <ErrorConsole />
    </ConnectionContext.Provider>
  </MemoryRouter>
);

const send = (session: Session, target: string) => act(async () => void (await session.transport.send({ method: "GET", target }).catch(() => undefined)));

describe("error console", () => {
  it("is a closed strip with a count, and no error before one happens", () => {
    render(rendered(newSession(() => new Response("{}"))));
    const toggle = screen.getByRole("button", { name: "Error console, 0 errors" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
  });

  it("counts new errors, slides open to the history and shows each error's details", async () => {
    const session = newSession((path) =>
      path.endsWith("/a")
        ? new Response(JSON.stringify(problem("Unauthorized", "02200", "Provided authorization is not valid", "Please log in")), { status: 401, headers: { "Content-Type": "application/problem+json", "RPP-Code": "02200", "RPP-Svtrid": "S-5" } })
        : new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/rpp+json" } }),
    );
    render(rendered(session));

    await send(session, "domainNames/ok");
    expect(screen.getByRole("button", { name: "Error console, 0 errors" })).toBeInTheDocument();
    await send(session, "domainNames/a");
    const toggle = screen.getByRole("button", { name: "Error console, 1 error, 1 new" });
    expect(toggle).toHaveTextContent("Unauthorized: Provided authorization is not valid");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const opened = screen.getByRole("button", { name: "Error console, 1 error" });
    const history = screen.getByRole("region", { name: "Error console" });
    expect(within(history).getByText("401")).toBeInTheDocument();
    expect(within(history).getByText("/rpp/domainNames/a")).toBeInTheDocument();
    expect(within(history).getByText("Please log in")).toBeInTheDocument();
    expect(within(history).getAllByText("02200").length).toBeGreaterThan(0);
    expect(within(history).getByText("$.name")).toBeInTheDocument();
    expect(within(history).getByText("S-5")).toBeInTheDocument();
    expect(opened).toBeInTheDocument();
  });

  it("lists errors newest first, also those that got no answer, and not 'not available'", async () => {
    const session = newSession((path) => {
      if (path.endsWith("/down")) throw new TypeError("offline");
      if (path.endsWith("/availability")) return new Response(JSON.stringify({ "@type": "domainNameAvailability", available: false }), { status: 404, headers: { "Content-Type": "application/rpp+json", "RPP-Code": "02303" } });
      return new Response(JSON.stringify(problem("Conflict", "02302", "Object exists")), { status: 409, headers: { "Content-Type": "application/problem+json", "RPP-Code": "02302" } });
    });
    render(rendered(session));
    await send(session, "domainNames/first");
    await send(session, "domainNames/taken.test/availability");
    await send(session, "domainNames/down");
    fireEvent.click(screen.getByRole("button", { name: /^Error console/ }));

    const rows = screen.getAllByText(/^(HTTP|Conflict|Network)/);
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("Network request failed"), expect.stringContaining("Conflict: Object exists")]);
    expect(screen.getByText("No response")).toBeInTheDocument();
  });

  it("clears the history, and closes with Escape and the close button", async () => {
    const session = newSession(() => new Response("oops", { status: 500, headers: { "Content-Type": "text/plain" } }));
    render(rendered(session));
    await send(session, "domainNames/a");
    const toggle = screen.getByRole("button", { name: /^Error console/ });
    fireEvent.click(toggle);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText(/No errors yet/)).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-label", "Error console, 0 errors");

    fireEvent.keyDown(screen.getByRole("heading", { name: /Errors received/ }), { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Close the error console" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("makes room in the page for the open console, so the screen above it can scroll clear of it", () => {
    const { container } = render(rendered(newSession(() => new Response("{}"))));
    const spacer = () => container.querySelector("[data-console-spacer]");
    expect(spacer()).toHaveAttribute("data-console-spacer", "closed");
    expect(spacer()).toHaveClass("h-0");
    fireEvent.click(screen.getByRole("button", { name: /^Error console/ }));
    expect(spacer()).toHaveAttribute("data-console-spacer", "open");
    expect(spacer()).toHaveClass("h-[calc(40dvh+2.25rem+1px)]");
  });

  it("starts a new history for a new connection", async () => {
    const first = newSession(() => new Response("x", { status: 500 }));
    const { rerender } = render(rendered(first));
    await send(first, "a");
    expect(screen.getByRole("button", { name: "Error console, 1 error, 1 new" })).toBeInTheDocument();
    rerender(rendered(newSession(() => new Response("{}"))));
    expect(screen.getByRole("button", { name: "Error console, 0 errors" })).toBeInTheDocument();
  });
});
