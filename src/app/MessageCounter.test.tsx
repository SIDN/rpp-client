// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createSession, type Session } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import { ConnectionContext, type ConnectionApi } from "./connection-context";
import { MessageCounter } from "./MessageCounter";

const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS } as const;

const newSession = (headers: () => Record<string, string>): Session =>
  createSession(PROFILE, undefined, {
    fetch: async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/rpp+json", ...headers() } }),
  });

const rendered = (session: Session | undefined) => (
  <MemoryRouter>
    <ConnectionContext.Provider value={{ session } as ConnectionApi}>
      <MessageCounter />
    </ConnectionContext.Provider>
  </MemoryRouter>
);

const send = (session: Session) => act(async () => void (await session.transport.send({ method: "GET", target: "domainNames/x" }).catch(() => undefined)));

describe("message counter", () => {
  it("shows nothing without a connection", () => {
    const { container } = render(rendered(undefined));
    expect(container).toBeEmptyDOMElement();
  });

  it("does not know the size of the queue before a response has said it", async () => {
    const session = newSession(() => ({}));
    render(rendered(session));
    expect(screen.getByRole("link", { name: "Messages, the size of the queue is not known yet" })).toHaveAttribute("href", "/messages");
    await send(session);
    expect(screen.getByRole("link", { name: /not known yet/ })).toBeInTheDocument();
  });

  it("follows RPP-Queue-Size of every response, and is in colour only when messages wait", async () => {
    let size = "0";
    const session = newSession(() => ({ "RPP-Queue-Size": size }));
    render(rendered(session));

    await send(session);
    const none = screen.getByRole("link", { name: "Messages, none waiting" });
    expect(none).toHaveAttribute("href", "/messages");
    expect(none).toHaveTextContent("0");
    expect(none).not.toHaveClass("bg-accent");

    size = "4";
    await send(session);
    const waiting = screen.getByRole("link", { name: "Messages, 4 waiting" });
    expect(waiting).toHaveClass("bg-accent");
    expect(waiting).toHaveTextContent("4");

    size = "0";
    await send(session);
    expect(screen.getByRole("link", { name: "Messages, none waiting" })).not.toHaveClass("bg-accent");
  });

  it("keeps the last size when a response has no valid one", async () => {
    let headers: Record<string, string> = { "RPP-Queue-Size": "2" };
    const session = newSession(() => headers);
    render(rendered(session));
    await send(session);
    expect(screen.getByRole("link", { name: "Messages, 2 waiting" })).toBeInTheDocument();

    headers = { "RPP-Queue-Size": "many" };
    await send(session);
    headers = {};
    await send(session);
    expect(screen.getByRole("link", { name: "Messages, 2 waiting" })).toBeInTheDocument();
  });

  it("does not learn anything from a request that got no answer", async () => {
    const offline = createSession(PROFILE, undefined, {
      fetch: async () => {
        throw new TypeError("offline");
      },
    });
    render(rendered(offline));
    await send(offline);
    expect(screen.getByRole("link", { name: /not known yet/ })).toBeInTheDocument();
  });
});
