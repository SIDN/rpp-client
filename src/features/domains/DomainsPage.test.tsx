// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { DiscoveryContext } from "@/app/discovery-context";
import { Providers } from "@/app/providers";
import { createSession } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import { DomainsPage } from "./DomainsPage";

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

const DOMAIN = {
  "@type": "domainName",
  name: "example.test",
  provMetadata: { "@type": "provMetadata", spClientId: "REG-1", crDate: "2024-01-01T00:00:00Z" },
  status: [
    { "@type": "domainStatus", label: "ok" },
    { "@type": "domainStatus", label: "clientHold" },
  ],
  registrant: { "@type": "contact", id: "C-1" },
  contacts: [{ label: "tech", object: { "@type": "contact", id: "C-2" } }],
  nameservers: [{ "@type": "host", hostName: "ns1.example.test" }],
  expiryDate: "2027-01-01T00:00:00Z",
  weird: { extra: true },
};

type Responder = (request: { method: string; path: string; headers: Headers; body: unknown }) => Response | Promise<Response>;

const answer = (body: unknown, init: { status?: number; code?: string; type?: string } = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...(body === undefined ? {} : { "Content-Type": init.type ?? "application/rpp+json" }), "RPP-Code": init.code ?? "01000", "RPP-Svtrid": "S-7" },
  });

function renderPage(responder: Responder, discovery: DiscoveryState = discoveryWith(["domainName"]), entry = "/") {
  const calls: { method: string; path: string; headers: Headers; body: unknown }[] = [];
  const session = createSession(PROFILE, undefined, {
    fetch: async (input, init) => {
      const url = input as URL;
      const request = {
        method: init?.method ?? "GET",
        path: `${url.pathname}${url.search}`.replace("/rpp", ""),
        headers: new Headers(init?.headers),
        body: init?.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown),
      };
      calls.push(request);
      const result = responder(request);
      // a real fetch ends with an AbortError when the signal fires
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        Promise.resolve(result).then(resolve, reject);
      });
    },
  });
  render(
    <Providers>
      <MemoryRouter initialEntries={[entry]}>
        <ConnectionContext.Provider value={{ session } as ConnectionApi}>
          <DiscoveryContext.Provider value={discovery}>
            <DomainsPage />
          </DiscoveryContext.Provider>
        </ConnectionContext.Provider>
      </MemoryRouter>
    </Providers>,
  );
  return { session, calls };
}

const panel = () => within(screen.getByRole("tabpanel"));
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const typeName = (value: string) => fireEvent.change(panel().getByLabelText("Domain name"), { target: { value } });

describe("domain names screen", () => {
  it("waits for a connection and for the capability", () => {
    renderPage(() => answer({}), { status: "not-started" });
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("does not offer workflows a server without domain names cannot do", () => {
    renderPage(() => answer({}), discoveryWith(["contact"]));
    expect(screen.getByRole("status")).toHaveTextContent("This server does not offer domain names");
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("starts on the tab and the name the address gives", () => {
    renderPage(() => answer({}), discoveryWith(["domainName"]), "/domains?name=example.test&tab=transfer");
    expect(screen.getByRole("tab", { name: "Transfer" })).toHaveAttribute("aria-selected", "true");
    expect(panel().getByLabelText("Domain name")).toHaveValue("example.test");
  });

  it("starts on Info for a tab it does not have", () => {
    renderPage(() => answer({}), discoveryWith(["domainName"]), "/domains?tab=nonsense");
    expect(screen.getByRole("tab", { name: "Info" })).toHaveAttribute("aria-selected", "true");
  });

  it("has a tab for each workflow, switched with the arrow keys", () => {
    renderPage(() => answer({}));
    const labels = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(labels).toEqual(["Info", "Check", "Register", "Change", "Renew", "Restore", "Transfer", "Delete"]);
    const first = screen.getByRole("tab", { name: "Info" });
    expect(first).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Check" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Check" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Check" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Delete" })).toHaveAttribute("aria-selected", "true");
  });

  it("looks a domain up and shows all of it", async () => {
    const { calls } = renderPage(() => answer(DOMAIN));
    typeName(" example.test ");
    fireEvent.click(panel().getByRole("button", { name: "Get info" }));

    await waitFor(() => expect(panel().getByText("Found example.test")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "GET", path: "/domainNames/example.test" });
    expect(calls[0]?.headers.get("RPP-Cltrid")).toMatch(/^rpp-client-\d{8}$/);

    const view = panel();
    expect(view.getByRole("list", { name: "Status" })).toHaveTextContent("clientHold");
    expect(view.getByText("C-1")).toBeInTheDocument();
    expect(view.getByText("C-2")).toBeInTheDocument();
    expect(view.getByText("ns1.example.test")).toBeInTheDocument();
    expect(view.getByText("REG-1")).toBeInTheDocument();
    expect(view.getByText("weird")).toBeInTheDocument();
    expect(view.getByText("S-7")).toBeInTheDocument();
    expect(view.getByRole("region", { name: "Request progress" })).toHaveTextContent("The registry answered with HTTP 200.");
  });

  it("asks for the transfer password only when told to, and keeps it hidden until shown", async () => {
    const { calls } = renderPage(() => answer({ ...DOMAIN, authInfo: { "@type": "authInfo", method: "authinfo", authdata: "Sup3rSecret" } }));
    typeName("example.test");
    fireEvent.click(panel().getByRole("checkbox", { name: /Include the transfer password/ }));
    fireEvent.click(panel().getByRole("button", { name: "Get info" }));
    await waitFor(() => expect(panel().getByText("Found example.test")).toBeInTheDocument());
    expect(calls[0]?.path).toBe("/domainNames/example.test?includeElements=authInfo");
    expect(document.body.textContent).not.toContain("Sup3rSecret");
    fireEvent.click(panel().getByRole("button", { name: "Show" }));
    expect(panel().getByText("Sup3rSecret")).toBeInTheDocument();
  });

  it("shows progress while the registry has not answered, and a way to stop waiting", async () => {
    let release: (response: Response) => void = () => undefined;
    renderPage(() => new Promise<Response>((resolve) => (release = resolve)));
    typeName("example.test");
    fireEvent.click(panel().getByRole("button", { name: "Get info" }));

    const progress = await waitFor(() => {
      const region = panel().getByRole("region", { name: "Request progress" });
      expect(region).toHaveTextContent("Waiting for the registry");
      return region;
    });
    expect(progress).toHaveAttribute("aria-busy", "true");
    expect(within(progress).getByRole("listitem", { current: "step" })).toHaveTextContent("Registry");
    expect(panel().getByRole("button", { name: "Waiting for the registry" })).toBeDisabled();

    release(answer(DOMAIN));
    await waitFor(() => expect(panel().getByRole("region", { name: "Request progress" })).toHaveAttribute("aria-busy", "false"));
    expect(panel().queryByRole("button", { name: "Cancel the request" })).toBeNull();
  });

  it("lets the person stop waiting", async () => {
    renderPage(() => new Promise<Response>(() => undefined));
    typeName("example.test");
    fireEvent.click(panel().getByRole("button", { name: "Get info" }));
    fireEvent.click(await panel().findByRole("button", { name: "Cancel the request" }));
    await waitFor(() => expect(panel().getByText("You stopped waiting")).toBeInTheDocument());
  });

  it("explains a refusal with the registry's own reason and code", async () => {
    renderPage(() =>
      answer({ type: "urn:ietf:params:rpp:error", title: "RPP Error", errors: [{ type: "t", result: "02303", reason: "No such domain" }] }, { status: 404, code: "02303", type: "application/problem+json" }),
    );
    typeName("nope.test");
    fireEvent.click(panel().getByRole("button", { name: "Get info" }));
    const alert = await panel().findByRole("alert");
    expect(alert).toHaveTextContent("The registry refused the request");
    expect(alert).toHaveTextContent("No such domain");
    expect(alert).toHaveTextContent("02303");
  });

  it("does not send a request without a name", async () => {
    const { calls } = renderPage(() => answer(DOMAIN));
    fireEvent.click(panel().getByRole("button", { name: "Get info" }));
    expect(await panel().findByRole("alert")).toHaveTextContent("Enter a domain name");
    expect(calls).toHaveLength(0);
  });
});

describe("check and register", () => {
  it("checks availability and moves on to registering", async () => {
    const { calls } = renderPage(() => answer({ "@type": "domainNameAvailability", available: true }));
    openTab("Check");
    typeName("new.test");
    fireEvent.click(panel().getByRole("button", { name: "Check availability" }));
    await waitFor(() => expect(panel().getByText("Available")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "GET", path: "/domainNames/new.test/availability" });
    fireEvent.click(panel().getByRole("button", { name: "Register this name" }));
    expect(screen.getByRole("tab", { name: "Register" })).toHaveAttribute("aria-selected", "true");
    expect(panel().getByLabelText("Domain name")).toHaveValue("new.test");
  });

  it("says when a name is taken, with the reason", async () => {
    renderPage(() => answer({ "@type": "domainNameAvailability", available: false, reason: "In use" }, { status: 404 }));
    openTab("Check");
    typeName("taken.test");
    fireEvent.click(panel().getByRole("button", { name: "Check availability" }));
    await waitFor(() => expect(panel().getByText("Not available")).toBeInTheDocument());
    expect(panel().getByText("In use")).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Register this name" })).toBeNull();
  });

  it("registers with what was entered", async () => {
    const { calls } = renderPage(() => answer(DOMAIN, { status: 201 }));
    openTab("Register");
    typeName("example.test");
    fireEvent.change(panel().getByLabelText("Registration period, number"), { target: { value: "2" } });
    fireEvent.change(panel().getByLabelText("Registrant"), { target: { value: "C-1" } });
    fireEvent.click(panel().getByRole("button", { name: "Add a contact" }));
    fireEvent.change(panel().getByLabelText("Role of contact 1"), { target: { value: "tech" } });
    fireEvent.change(panel().getByLabelText("Identifier of contact 1"), { target: { value: "C-2" } });
    fireEvent.click(panel().getByRole("button", { name: "Add a name server" }));
    fireEvent.change(panel().getByLabelText("Name server 1"), { target: { value: "ns1.example.test" } });
    fireEvent.click(panel().getByRole("button", { name: "Register domain" }));

    await waitFor(() => expect(panel().getByText("Registered example.test")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/domainNames",
      body: {
        "@type": "domainName",
        name: "example.test",
        registrant: { "@type": "contact", id: "C-1" },
        contacts: [{ label: "tech", object: { "@type": "contact", id: "C-2" } }],
        nameservers: [{ "@type": "host", hostName: "ns1.example.test" }],
        processes: { createProcess: [{ period: { value: 2, unit: "y" } }] },
      },
    });
  });

  it("lets a contact's role be chosen from admin, billing and tech only, and asks for one", async () => {
    const { calls } = renderPage(() => answer(DOMAIN, { status: 201 }));
    openTab("Register");
    typeName("example.test");
    fireEvent.click(panel().getByRole("button", { name: "Add a contact" }));
    const role = panel().getByRole("combobox", { name: "Role of contact 1" });
    expect(within(role).getAllByRole("option").map((option) => option.textContent)).toEqual(["Choose a role", "admin", "billing", "tech"]);

    fireEvent.change(panel().getByLabelText("Identifier of contact 1"), { target: { value: "C-2" } });
    fireEvent.click(panel().getByRole("button", { name: "Register domain" }));
    expect(await panel().findByText("Choose a role")).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    fireEvent.change(role, { target: { value: "billing" } });
    fireEvent.click(panel().getByRole("button", { name: "Register domain" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ contacts: [{ label: "billing", object: { id: "C-2" } }] });
  });

  it("refuses a period that is not a whole number before sending", async () => {
    const { calls } = renderPage(() => answer(DOMAIN, { status: 201 }));
    openTab("Register");
    typeName("example.test");
    fireEvent.change(panel().getByLabelText("Registration period, number"), { target: { value: "1.5" } });
    fireEvent.click(panel().getByRole("button", { name: "Register domain" }));
    expect(await panel().findByText("Use a whole number of 1 or more")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("asks for the ruleset of a Unicode name", () => {
    renderPage(() => answer(DOMAIN));
    openTab("Register");
    expect(panel().queryByLabelText("Label Generation Ruleset")).toBeNull();
    typeName("bücher.example");
    expect(panel().getByLabelText("Label Generation Ruleset")).toBeInTheDocument();
    expect(panel().getByText("xn--bcher-kva.example")).toBeInTheDocument();
  });
});

describe("change", () => {
  it("loads the domain, shows what will be sent and sends only that", async () => {
    const { calls } = renderPage((request) => (request.method === "PATCH" ? answer({ ...DOMAIN, registrant: { "@type": "contact", id: "C-9" } }) : answer(DOMAIN)));
    openTab("Change");
    typeName("example.test");
    expect(panel().getByText("Load the domain to change it")).toBeInTheDocument();
    fireEvent.click(panel().getByRole("button", { name: "Load the domain" }));
    await waitFor(() => expect(panel().getByLabelText("Registrant")).toHaveValue("C-1"));

    const save = panel().getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    expect(panel().getByText("Nothing has been changed yet.")).toBeInTheDocument();

    fireEvent.change(panel().getByLabelText("Registrant"), { target: { value: "C-9" } });
    fireEvent.click(panel().getByRole("checkbox", { name: "clientHold" }));
    await waitFor(() => expect(save).toBeEnabled());
    const summary = panel().getByRole("region", { name: "Changes to send" });
    expect(summary).toHaveTextContent("Replace the registrant with C-9");
    expect(summary).toHaveTextContent("Remove status clientHold");

    fireEvent.click(save);
    await waitFor(() => expect(panel().getByText("Changed example.test")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({
      method: "PATCH",
      path: "/domainNames/example.test",
      body: [
        { op: "replace", path: "/registrant", value: { "@type": "contact", id: "C-9" } },
        { op: "remove", path: "/status", match: { label: "clientHold" } },
      ],
    });
    // the form starts over from what the registry returned
    await waitFor(() => expect(panel().getByLabelText("Registrant")).toHaveValue("C-9"));
    expect(panel().getByText("Changed example.test")).toBeInTheDocument();
  });
});

describe("renew", () => {
  it("sends the expiry date of the domain that was looked up", async () => {
    const { calls } = renderPage((request) => (request.path.includes("renewProcesses") ? answer({ "@type": "renewProcess", expiryDate: "2029-01-01T00:00:00Z" }) : answer(DOMAIN)));
    typeName("example.test");
    fireEvent.click(panel().getByRole("button", { name: "Get info" }));
    await waitFor(() => expect(panel().getByText("Found example.test")).toBeInTheDocument());

    openTab("Renew");
    expect(panel().getByRole("checkbox", { name: /Send the current expiry date/ })).toBeChecked();
    fireEvent.change(panel().getByLabelText("Renew for, number"), { target: { value: "2" } });
    fireEvent.click(panel().getByRole("button", { name: "Renew domain" }));

    await waitFor(() => expect(panel().getByText("Renewed example.test")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({
      method: "POST",
      path: "/domainNames/example.test/processes/renewProcesses",
      body: { "@type": "renewProcess", expiryDate: "2027-01-01T00:00:00Z", renewalPeriod: { value: 2, unit: "y" } },
    });
    expect(panel().getByText("2029-01-01T00:00:00Z")).toBeInTheDocument();
  });

  it("says that the expiry date is not known before the info is read", () => {
    renderPage(() => answer({}));
    openTab("Renew");
    expect(panel().getByText("The current expiry date is not known")).toBeInTheDocument();
  });
});

describe("restore", () => {
  it("asks for a restore, then sends the report, then reads the status", async () => {
    const { calls } = renderPage(() => answer({ "@type": "restoreProcess", restoreStatus: "pendingRestore" }));
    openTab("Restore");
    typeName("example.test");
    fireEvent.click(panel().getByRole("button", { name: "Ask for a restore" }));
    await waitFor(() => expect(panel().getByText("The registry took the restore")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "POST", path: "/domainNames/example.test/processes/restoreProcesses", body: { "@type": "restoreProcess" } });
    expect(panel().getAllByText("pendingRestore").length).toBeGreaterThan(0);

    fireEvent.click(panel().getByRole("radio", { name: /Send the restore report/ }));
    fireEvent.click(panel().getByRole("button", { name: "Send the report" }));
    expect(await panel().findAllByText("Required")).not.toHaveLength(0);
    expect(calls).toHaveLength(1);

    const fill = (label: string, value: string) => fireEvent.change(panel().getByLabelText(label), { target: { value } });
    fill("Registration data before the delete", "before");
    fill("Registration data after the restore", "after");
    fill("Deleted at", "2026-01-10T12:00");
    fill("Restore asked at", "2026-01-20T15:30");
    fill("Reason for the restore", "deleted in error");
    fill("First statement", "one");
    fill("Second statement", "two");
    fireEvent.click(panel().getByRole("button", { name: "Send the report" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({
      method: "PUT",
      path: "/domainNames/example.test/processes/restoreProcesses/latest",
      body: { "@type": "restoreProcess", restoreReport: { preData: "before", postData: "after", restoreReason: "deleted in error", statements: ["one", "two"] } },
    });

    fireEvent.click(panel().getByRole("radio", { name: "Check the restore status" }));
    fireEvent.click(panel().getByRole("button", { name: "Check the status" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]).toMatchObject({ method: "GET", path: "/domainNames/example.test/processes/restoreProcesses/latest" });
  });
});

describe("transfer", () => {
  it("asks for a transfer with the password in the header only", async () => {
    const { calls } = renderPage(() => answer({ "@type": "domainTransferProcess", trStatus: "pending", reqClientId: "ME", requestDate: "2026-01-01T00:00:00Z", actClientId: "THEM", actionDate: "2026-01-06T00:00:00Z" }));
    openTab("Transfer");
    typeName("example.test");
    fireEvent.click(panel().getByRole("button", { name: "Ask for the transfer" }));
    expect(await panel().findByText("Enter the transfer password of the domain")).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    fireEvent.change(panel().getByLabelText("Transfer password"), { target: { value: "pw 123" } });
    fireEvent.click(panel().getByRole("button", { name: "Ask for the transfer" }));
    await waitFor(() => expect(panel().getByText("The registry took the transfer request")).toBeInTheDocument());
    expect(calls[0]?.headers.get("RPP-Authorization")).toBe(`authinfo value=${btoa("pw 123")}`);
    expect(JSON.stringify(calls[0]?.body)).not.toContain("pw 123");
    expect(panel().getByText("pending")).toBeInTheDocument();
    expect(panel().getByText("THEM")).toBeInTheDocument();
  });

  it("asks before it approves, and then approves the latest transfer", async () => {
    const { calls } = renderPage(() => answer(undefined));
    openTab("Transfer");
    typeName("example.test");
    fireEvent.click(panel().getByRole("radio", { name: /Approve a transfer away from you/ }));
    fireEvent.click(panel().getByRole("button", { name: "Approve the transfer" }));
    expect(calls).toHaveLength(0);
    const confirm = panel().getByRole("group", { name: "Approve the transfer of example.test?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Approve for example.test" }));
    await waitFor(() => expect(panel().getByText("The transfer was approved")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "POST", path: "/domainNames/example.test/processes/transferProcesses/latest/transferApprove" });
  });
});

describe("delete", () => {
  it("needs the name typed before it deletes", async () => {
    const { calls } = renderPage(() => answer(undefined));
    openTab("Delete");
    typeName("example.test");
    fireEvent.click(panel().getByRole("button", { name: "Delete this domain" }));
    const confirm = panel().getByRole("group", { name: "Delete example.test?" });
    const button = within(confirm).getByRole("button", { name: "Delete example.test" });
    expect(button).toBeDisabled();
    fireEvent.change(within(confirm).getByLabelText(/Type/), { target: { value: "example.test" } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(panel().getByText("Deleted example.test")).toBeInTheDocument());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/domainNames/example.test" });
  });

  it("can be called off", () => {
    const { calls } = renderPage(() => answer(undefined));
    openTab("Delete");
    typeName("example.test");
    fireEvent.click(panel().getByRole("button", { name: "Delete this domain" }));
    fireEvent.click(panel().getByRole("button", { name: "Do not do it" }));
    expect(panel().getByRole("button", { name: "Delete this domain" })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});

vi.setConfig({ testTimeout: 15_000 });
