// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { DiscoveryContext } from "@/app/discovery-context";
import { Providers } from "@/app/providers";
import { SettingsContext } from "@/app/settings-context";
import { resolvePreset } from "@/application/connection/preset";
import { createSession } from "@/application/connection/session";
import { MESSAGE_TYPES } from "@/application/messages/messages";
import { synthesizeMessages } from "@/application/messages/synthesize";
import { DEFAULT_SETTINGS } from "@/config/appSettings";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import { MessagesPage } from "./MessagesPage";

const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS } as const;

const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};

const discoveryWith = (objects: string[]): DiscoveryState => ({
  status: "ready",
  snapshot: parseDiscoveryDocument(
    {
      "@type": "discovery",
      versions: [{ version: "1.0", baseUrl: PROFILE.baseUrl }],
      environment: { name: "test", status: "stable" },
      tlds: ["test"],
      presets: [{ id: "p", version: "1.0", defaultPreset: true, extensions: [] }],
      objects,
      datetime: "2026-01-01T00:00:00Z",
    },
    SOURCE,
  ).snapshot,
});

type Call = { method: string; path: string };
type Responder = (request: Call) => Response | Promise<Response>;

const answer = (body: unknown, init: { status?: number; code?: string } = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/rpp+json" }), "RPP-Code": init.code ?? "01301", "RPP-Svtrid": "S-7" },
  });

function renderPage(
  responder: Responder,
  options: { discovery?: DiscoveryState; synthesize?: boolean; connected?: boolean } = {},
) {
  const { discovery = discoveryWith(["message"]), synthesize = false, connected = true } = options;
  const calls: Call[] = [];
  const session = connected
    ? createSession(PROFILE, undefined, {
        fetch: async (input, init) => {
          const url = input as URL;
          const call = { method: init?.method ?? "GET", path: `${url.pathname}${url.search}`.replace("/rpp", "") };
          calls.push(call);
          return responder(call);
        },
      })
    : undefined;
  const snapshot = discovery.status === "ready" ? discovery.snapshot : undefined;
  render(
    <Providers>
      <MemoryRouter>
        <SettingsContext.Provider value={{ settings: { ...DEFAULT_SETTINGS, synthesizeData: synthesize }, update: () => {} }}>
          <ConnectionContext.Provider value={{ session, resolvedPreset: resolvePreset(DEFAULT_PRESET_SETTINGS, snapshot) } as ConnectionApi}>
            <DiscoveryContext.Provider value={discovery}>
              <MessagesPage />
            </DiscoveryContext.Provider>
          </ConnectionContext.Provider>
        </SettingsContext.Provider>
      </MemoryRouter>
    </Providers>,
  );
  return { calls };
}

const messageOf = (n: number, type: string, data: Record<string, unknown> = {}) => ({
  "@type": "message",
  id: `M-${n}`,
  creationDate: `2026-01-${String((n % 28) + 1).padStart(2, "0")}T10:00:00Z`,
  status: "delivered",
  data: { "@type": type, objectType: "domainName", objectId: `example-${n}.test`, ...data },
});

/** One message for each type, from the examples the client makes up, under the identifiers a server would use. */
const ONE_OF_EACH = MESSAGE_TYPES.map(({ id }, index) => {
  const example = synthesizeMessages({ types: [id] })[0]!;
  return { ...example, id: `M-${index + 1}` };
});

const many = (count: number) =>
  Array.from({ length: count }, (_, index) => messageOf(index + 1, MESSAGE_TYPES[index % MESSAGE_TYPES.length]!.id, { message: "x", status: "pending", requestDate: "2026-01-01T00:00:00Z" }));

const rows = () => within(screen.getByRole("table", { name: "Messages" })).getAllByRole("row").slice(1);
const choose = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const show = () => fireEvent.click(screen.getByRole("button", { name: "Show messages" }));

describe("messages screen", () => {
  it("waits for a connection", () => {
    renderPage(() => answer([]), { discovery: { status: "not-started" }, connected: false });
    expect(screen.getByRole("heading", { level: 1, name: "Messages" })).toBeInTheDocument();
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("says so when the server has no messages", () => {
    renderPage(() => answer([]), { discovery: discoveryWith(["domainName"]) });
    expect(screen.getByRole("status")).toHaveTextContent("This server does not offer messages");
    expect(screen.queryByRole("button", { name: "Show messages" })).toBeNull();
  });

  it("asks nothing of the server until told to", () => {
    const { calls } = renderPage(() => answer([]));
    expect(screen.getByText("No messages retrieved yet")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(screen.getByText(/Retrieving messages marks them as delivered/)).toBeInTheDocument();
  });

  it("offers a select box with every message type and all types, and a limit of 25 by default", () => {
    renderPage(() => answer([]));
    const type = screen.getByLabelText("Message type");
    expect(within(type).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All types",
      "Review response",
      "Transfer request",
      "Transfer outcome",
      "Expiration deletion",
      "Auto-renewal",
      "Service notice",
    ]);
    expect(screen.getByLabelText("Show at most")).toHaveValue("25");
    expect(within(screen.getByLabelText("Show at most")).getAllByRole("option").map((option) => option.textContent)).toEqual(["10", "25", "50", "100"]);
  });
});

describe("retrieving messages", () => {
  it("shows many messages, as many as the limit says, and says how many there are", async () => {
    const { calls } = renderPage(() => answer(many(60)));
    show();
    await screen.findByRole("table", { name: "Messages" });
    expect(calls).toEqual([{ method: "GET", path: "/messages" }]);
    expect(rows()).toHaveLength(25);
    expect(screen.getByText(/Showing 25 of 60 message\(s\)\. Raise the limit/)).toBeInTheDocument();

    choose("Show at most", "50");
    expect(rows()).toHaveLength(50);
    choose("Show at most", "100");
    expect(rows()).toHaveLength(60);
    expect(screen.getByText("Showing 60 of 60 message(s).")).toBeInTheDocument();
    choose("Show at most", "10");
    expect(rows()).toHaveLength(10);
    expect(calls).toHaveLength(1);
  });

  it("shows a lone message, which is how the draft once said the server answers", async () => {
    renderPage(() => answer(ONE_OF_EACH[0]));
    show();
    await screen.findByRole("table", { name: "Messages" });
    expect(rows()).toHaveLength(1);
  });

  it("shows for each message its identifier, type, object, date, status and a summary", async () => {
    renderPage(() => answer([ONE_OF_EACH[1]]));
    show();
    await screen.findByRole("table", { name: "Messages" });
    const [row] = rows();
    expect(row).toBeDefined();
    const cells = within(row!).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("M-2");
    expect(cells[1]).toHaveTextContent("Transfer request");
    expect(cells[2]).toHaveTextContent("leaving.example.test");
    expect(cells[2]).toHaveTextContent("domainName");
    expect(cells[4]).toHaveTextContent("delivered");
    expect(cells[5]).toHaveTextContent("Transfer pending, respond before");
  });

  it("asks the server for one type when one is selected, and for all when none is", async () => {
    const { calls } = renderPage((request) => answer(request.path.includes("type=") ? [ONE_OF_EACH[2]] : ONE_OF_EACH));
    show();
    await screen.findByRole("table", { name: "Messages" });
    expect(rows()).toHaveLength(6);

    choose("Message type", "transferRequestMessage");
    expect(calls).toHaveLength(1);
    show();
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(calls.at(-1)).toEqual({ method: "GET", path: "/messages?type=transferRequestMessage" });

    choose("Message type", "");
    show();
    await waitFor(() => expect(rows()).toHaveLength(6));
    expect(calls.at(-1)).toEqual({ method: "GET", path: "/messages" });
  });

  it("warns when the server answers with other types than the one asked for, and shows them", async () => {
    renderPage(() => answer(ONE_OF_EACH));
    choose("Message type", "autoRenewalMessage");
    show();
    expect(await screen.findByText("The server returned other types as well")).toBeInTheDocument();
    expect(screen.getByText(/5 of the messages are not of the type Auto-renewal/)).toBeInTheDocument();
    expect(rows()).toHaveLength(6);
  });

  it("offers a type it does not know to filter on once it has seen one", async () => {
    renderPage(() => answer([messageOf(1, "somethingNewMessage", { detail: "x" })]));
    show();
    await screen.findByRole("table", { name: "Messages" });
    expect(within(screen.getByLabelText("Message type")).getByRole("option", { name: "somethingNewMessage" })).toBeInTheDocument();
  });

  it("says so when the queue is empty, for a type or for all", async () => {
    renderPage(() => answer(undefined, { code: "01300" }));
    show();
    expect(await screen.findByText("No messages")).toBeInTheDocument();
    expect(screen.getByText(/The queue holds no messages/)).toBeInTheDocument();
    choose("Message type", "serviceNoticeMessage");
    show();
    await waitFor(() => expect(screen.getByText(/of the type Service notice/)).toBeInTheDocument());
  });

  it("explains a refusal with the registry's own reason", async () => {
    renderPage(() =>
      new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "Forbidden", errors: [{ type: "t", result: "02201", reason: "Not allowed to read the queue" }] }), {
        status: 403,
        headers: { "Content-Type": "application/problem+json", "RPP-Code": "02201" },
      }),
    );
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed to read the queue");
  });
});

describe("message details", () => {
  const open = async (id: string) => {
    show();
    await screen.findByRole("table", { name: "Messages" });
    fireEvent.click(screen.getByRole("button", { name: `Details of ${id}` }));
    return within(screen.getByRole("article", { name: `Message ${id}` }));
  };
  const dd = (view: ReturnType<typeof within>, term: string) => view.getByText(term, { selector: "dt" }).nextElementSibling as HTMLElement;

  it("shows no details until a message is clicked, and the details of the one that is", async () => {
    renderPage(() => answer(ONE_OF_EACH));
    show();
    await screen.findByRole("table", { name: "Messages" });
    expect(screen.queryByRole("article")).toBeNull();
    fireEvent.click(rows()[3]!);
    expect(screen.getByRole("article", { name: "Message M-4" })).toBeInTheDocument();
    expect(rows()[3]).toHaveAttribute("aria-selected", "true");
  });

  it("shows a review response", async () => {
    renderPage(() => answer(ONE_OF_EACH));
    const view = await open("M-1");
    expect(dd(view, "Type")).toHaveTextContent("reviewResponseMessage");
    expect(dd(view, "About")).toHaveTextContent("approved.example.test");
    expect(dd(view, "Result")).toHaveTextContent("Approved");
    expect(dd(view, "Client transaction ID")).toHaveTextContent("CLT-1001");
    expect(dd(view, "Server transaction ID")).toHaveTextContent("SRV-5001");
    expect(dd(view, "Message")).toHaveTextContent("The registration was approved after review.");
    const process = within(view.getByRole("region", { name: "Process" }));
    expect(process.getByRole("rowheader", { name: "Process ID" }).nextElementSibling).toHaveTextContent("P-1001");
    expect(process.getByRole("rowheader", { name: "Type" }).nextElementSibling).toHaveTextContent("createProcess");
    expect(view.queryByText(/\{"@type":"createProcess"/)).toBeNull();
    expect(process.getByRole("link", { name: "Open in Domain names" })).toHaveAttribute("href", "/domains?name=approved.example.test&tab=info");
  });

  it("shows a transfer request", async () => {
    renderPage(() => answer(ONE_OF_EACH));
    const view = await open("M-2");
    expect(dd(view, "Transfer status")).toHaveTextContent("pending");
    expect(dd(view, "Requested")).toBeInTheDocument();
    expect(dd(view, "Respond before")).toBeInTheDocument();
    const process = within(view.getByRole("region", { name: "Process" }));
    expect(process.getByRole("rowheader", { name: "Process ID" }).nextElementSibling).toHaveTextContent("T-3001");
    expect(process.getByRole("rowheader", { name: "Transfer status" }).nextElementSibling).toHaveTextContent("pending");
    expect(process.getByRole("rowheader", { name: "Direction" }).nextElementSibling).toHaveTextContent("pull");
    expect(process.getByRole("link", { name: "Open in Domain names" })).toHaveAttribute("href", "/domains?name=leaving.example.test&tab=transfer");
  });

  it("shows a transfer outcome", async () => {
    renderPage(() => answer(ONE_OF_EACH));
    const view = await open("M-3");
    expect(dd(view, "Transfer status")).toHaveTextContent("serverApproved");
    expect(dd(view, "Resolved")).toBeInTheDocument();
    expect(dd(view, "New expiry")).toBeInTheDocument();
  });

  it("shows an expiration deletion, an auto-renewal and a service notice", async () => {
    renderPage(() => answer(ONE_OF_EACH));
    show();
    await screen.findByRole("table", { name: "Messages" });
    fireEvent.click(screen.getByRole("button", { name: "Details of M-4" }));
    expect(dd(within(screen.getByRole("article", { name: "Message M-4" })), "Deleted")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details of M-5" }));
    const renewal = within(screen.getByRole("article", { name: "Message M-5" }));
    expect(dd(renewal, "Renewed")).toBeInTheDocument();
    expect(dd(renewal, "New expiry")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details of M-6" }));
    const notice = within(screen.getByRole("article", { name: "Message M-6" }));
    expect(dd(notice, "Message")).toHaveTextContent("Planned maintenance");
    expect(dd(notice, "About")).toHaveTextContent("Not about a specific object");
  });

  it("shows a type this client does not know as received, with its members", async () => {
    const odd = messageOf(7, "somethingNewMessage", { detail: "extra" });
    renderPage(() => answer([odd]));
    show();
    await screen.findByRole("table", { name: "Messages" });
    fireEvent.click(screen.getByRole("button", { name: "Details of M-7" }));
    const view = within(screen.getByRole("article", { name: "Message M-7" }));
    expect(view.getByText("This client does not know this message type")).toBeInTheDocument();
    expect(dd(view, "Other members")).toHaveTextContent("detail");
    expect(dd(view, "Other members")).toHaveTextContent("extra");
  });
});

describe("acknowledging", () => {
  it("asks first, then acknowledges the message with DELETE and drops it from the list", async () => {
    const { calls } = renderPage((request) => (request.method === "DELETE" ? answer(undefined, { code: "01000" }) : answer(ONE_OF_EACH)));
    show();
    await screen.findByRole("table", { name: "Messages" });
    fireEvent.click(screen.getByRole("button", { name: "Details of M-2" }));
    fireEvent.click(within(screen.getByRole("article", { name: "Message M-2" })).getByRole("button", { name: "Acknowledge message" }));
    expect(calls).toHaveLength(1);
    fireEvent.click(within(screen.getByRole("group", { name: "Acknowledge M-2?" })).getByRole("button", { name: "Acknowledge M-2" }));

    await waitFor(() => expect(screen.getByText("Acknowledged M-2")).toBeInTheDocument());
    expect(calls.at(-1)).toEqual({ method: "DELETE", path: "/messages/M-2" });
    expect(rows()).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "Details of M-2" })).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("keeps the message when the registry refuses, and says why", async () => {
    renderPage((request) =>
      request.method === "DELETE"
        ? new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "Not Found", errors: [{ type: "t", result: "02303", reason: "No such message" }] }), {
            status: 404,
            headers: { "Content-Type": "application/problem+json", "RPP-Code": "02303" },
          })
        : answer(ONE_OF_EACH),
    );
    show();
    await screen.findByRole("table", { name: "Messages" });
    fireEvent.click(screen.getByRole("button", { name: "Details of M-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge message" }));
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge M-1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No such message");
    expect(rows()).toHaveLength(6);
  });
});

describe("synthesized data", () => {
  it("works without a connection, marks itself, and asks nothing of any server", () => {
    renderPage(() => answer([]), { synthesize: true, connected: false, discovery: { status: "not-started" } });
    expect(screen.getByText("Synthesized data")).toBeInTheDocument();
    expect(screen.queryByText("Connect to a server first")).toBeNull();
    expect(screen.queryByText(/Retrieving messages marks them as delivered/)).toBeNull();
    show();
    expect(rows()).toHaveLength(12);
    expect(screen.getAllByText("Synthesized").length).toBe(12);
  });

  it("makes two examples of each type, and sends nothing even when connected", () => {
    const { calls } = renderPage(() => answer([]), { synthesize: true });
    show();
    const types = rows().map((row) => within(row).getAllByRole("cell")[1]?.textContent);
    for (const { label } of MESSAGE_TYPES) expect(types.filter((type) => type === label)).toHaveLength(2);
    expect(calls).toHaveLength(0);
  });

  it("filters on the message type, and limits what is shown", () => {
    renderPage(() => answer([]), { synthesize: true, connected: false, discovery: { status: "not-started" } });
    choose("Message type", "serviceNoticeMessage");
    show();
    expect(rows()).toHaveLength(2);
    choose("Message type", "");
    show();
    choose("Show at most", "10");
    expect(rows()).toHaveLength(10);
    expect(screen.getByText(/Showing 10 of 12 message\(s\)/)).toBeInTheDocument();
  });

  it("shows details of a synthesized message as such, and acknowledging only removes it from the list", () => {
    const { calls } = renderPage(() => answer([]), { synthesize: true });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Details of SYNTH-001" }));
    const view = within(screen.getByRole("article", { name: "Message SYNTH-001" }));
    expect(view.getByText("Synthesized example")).toBeInTheDocument();
    fireEvent.click(view.getByRole("button", { name: "Acknowledge message" }));
    expect(screen.getByText(/only removed from this list, and nothing is sent to the server/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge SYNTH-001" }));

    expect(rows()).toHaveLength(11);
    expect(screen.getByText("Removed SYNTH-001 from the list")).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
