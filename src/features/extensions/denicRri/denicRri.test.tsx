// @vitest-environment jsdom
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { DiscoveryContext } from "@/app/discovery-context";
import { Providers } from "@/app/providers";
import { resolvePreset } from "@/application/connection/preset";
import { createSession } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS, type PresetSettings, type UpdateMode } from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import { DomainsPage } from "@/features/domains/DomainsPage";
import { RequestContactsPage } from "./RequestContactsPage";
import presetSchema from "@/test/fixtures/rri-preset-schema.json";

const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS, updateMode: "partial" } as const;
const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};

const RRI = { "@type": "extension", id: "de.denic.rpp.rri", name: "DENIC RRI", version: "0.2.0" };
const RRI_PRESET = { id: "de.denic.rpp.preset.rri", version: "1.0" };

function discoveryWith(options: { rriDefault?: boolean; extensionVersion?: string; objects?: string[]; advertised?: boolean } = {}): DiscoveryState {
  const extension = { ...RRI, version: options.extensionVersion ?? RRI.version };
  return {
    status: "ready",
    snapshot: parseDiscoveryDocument(
      {
        "@type": "discovery",
        versions: [{ version: "1.0", baseUrl: PROFILE.baseUrl }],
        tlds: ["de"],
        objects: options.objects ?? ["domainName", "contact", "requestContact"],
        extensions: options.advertised === false ? [] : [extension],
        presets: [
          { id: "urn:ietf:params:rpp:preset:base", version: "1.0", defaultPreset: options.rriDefault === false, extensions: [] },
          { ...RRI_PRESET, defaultPreset: options.rriDefault !== false, extensions: options.advertised === false ? [] : [extension] },
        ],
      },
      SOURCE,
    ).snapshot,
  };
}

const answer = (body: unknown, init: { status?: number; code?: string; type?: string } = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...(body === undefined ? {} : { "Content-Type": init.type ?? "application/rpp+json" }), "RPP-Code": init.code ?? "01000", "RPP-Svtrid": "S-7" },
  });

type Call = { method: string; path: string; headers: Headers; body: unknown };

function renderPage(page: ReactElement, responder: (call: Call) => Response, discovery: DiscoveryState = discoveryWith(), entry = "/", presetSettings: PresetSettings = DEFAULT_PRESET_SETTINGS, updateMode: UpdateMode = "partial") {
  const calls: Call[] = [];
  const session = createSession({ ...PROFILE, updateMode }, undefined, {
    fetch: async (input, init) => {
      const url = input as URL;
      const call = {
        method: init?.method ?? "GET",
        path: `${url.pathname}${url.search}`.replace("/rpp", ""),
        headers: new Headers(init?.headers),
        body: init?.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown),
      };
      calls.push(call);
      return responder(call);
    },
  });
  const snapshot = discovery.status === "ready" ? discovery.snapshot : undefined;
  const api = { session, resolvedPreset: resolvePreset(presetSettings, snapshot) } as ConnectionApi;
  render(
    <Providers>
      <MemoryRouter initialEntries={[entry]}>
        <ConnectionContext.Provider value={api}>
          <DiscoveryContext.Provider value={discovery}>{page}</DiscoveryContext.Provider>
        </ConnectionContext.Provider>
      </MemoryRouter>
    </Providers>,
  );
  return { calls };
}

const panel = () => within(screen.getByRole("tabpanel"));
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

const TEMPLATE = "https://www.example.com/contact?domain={Alabel}";
const STORED = {
  "@type": "requestContact",
  id: "DENIC-1000022-GR",
  provMetadata: { "@type": "provMetadata", spClientId: "DENIC-1000022", upDate: "2026-11-12T00:20:20.0Z" },
  uriTemplate: TEMPLATE,
};

describe("request contacts screen", () => {
  it("waits for a connection", () => {
    renderPage(<RequestContactsPage />, () => answer({}), { status: "not-started" });
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("is not usable when the server does not advertise the extension", () => {
    renderPage(<RequestContactsPage />, () => answer({}), discoveryWith({ advertised: false }));
    expect(screen.getByRole("status")).toHaveTextContent("Request contacts are not available");
    expect(screen.getByRole("status")).toHaveTextContent("does not advertise the DENIC RRI extension");
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("says which preset lacks the extension", () => {
    renderPage(<RequestContactsPage />, () => answer({}), discoveryWith({ rriDefault: false }));
    expect(screen.getByRole("status")).toHaveTextContent("preset urn:ietf:params:rpp:preset:base 1.0");
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("is usable when requests name the preset with the extension", () => {
    renderPage(<RequestContactsPage />, () => answer({}), discoveryWith({ rriDefault: false }), "/", { signalling: "header", selection: RRI_PRESET });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Info", "Check", "Create", "Change"]);
  });

  it("names a version it does not implement", () => {
    renderPage(<RequestContactsPage />, () => answer({}), discoveryWith({ extensionVersion: "0.1.0" }));
    expect(screen.getByRole("status")).toHaveTextContent("version 0.1.0; this client implements version 0.2.0");
  });

  it("needs requestContact among the objects of the server", () => {
    renderPage(<RequestContactsPage />, () => answer({}), discoveryWith({ objects: ["domainName"] }));
    expect(screen.getByRole("status")).toHaveTextContent("does not list requestContact");
  });

  it("marks itself as a feature of the extension and offers no delete", () => {
    renderPage(<RequestContactsPage />, () => answer({}));
    expect(screen.getByText("Extension: DENIC RRI")).toHaveAttribute("title", "de.denic.rpp.rri");
    expect(screen.getByText(/cannot be deleted/)).toBeInTheDocument();
  });

  it("looks a request contact up at once when a link leads here", async () => {
    const { calls } = renderPage(<RequestContactsPage />, () => answer(STORED), discoveryWith(), "/request-contacts?tab=info&name=DENIC-1000022-GR&run=1");
    await waitFor(() => expect(panel().getByText("Request contact DENIC-1000022-GR found")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "GET", path: "/requestContacts/DENIC-1000022-GR" });
    expect(panel().getByText(TEMPLATE)).toBeInTheDocument();
    expect(panel().getByText("DENIC-1000022")).toBeInTheDocument();

    fireEvent.change(panel().getByLabelText("Preview for domain name"), { target: { value: "bücher.de" } });
    expect(panel().getByText("https://www.example.com/contact?domain=xn--bcher-kva.de")).toBeInTheDocument();
  });

  it("checks a handle, a 404 being the answer that it is taken", async () => {
    const { calls } = renderPage(<RequestContactsPage />, () => answer({ "@type": "requestContactAvailability", available: false, reason: "In use" }, { status: 404 }));
    openTab("Check");
    fireEvent.change(panel().getByLabelText("Handle"), { target: { value: "DENIC-1000022-GR" } });
    fireEvent.click(panel().getByRole("button", { name: "Check handle" }));
    await waitFor(() => expect(panel().getByText("Not available")).toBeInTheDocument());
    expect(panel().getByText("In use")).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: "GET", path: "/requestContacts/DENIC-1000022-GR/availability" });
  });

  it("advises on a template as it is typed, and sends it as typed", async () => {
    const { calls } = renderPage(<RequestContactsPage />, () => answer({ ...STORED, uriTemplate: "ftp://x.example/{domain}" }, { status: 201 }));
    openTab("Create");
    fireEvent.change(panel().getByLabelText("Handle"), { target: { value: "DENIC-1000022-GR" } });
    fireEvent.click(panel().getByRole("button", { name: "Create request contact" }));
    expect(await panel().findByText("Enter a URI Template")).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    fireEvent.change(panel().getByLabelText("URI Template"), { target: { value: "ftp://x.example/{domain}" } });
    expect(panel().getByText("Start with http:, https: or mailto:.")).toBeInTheDocument();
    expect(panel().getByText("{domain} is not known; only {Alabel} and {Ulabel} can be used.")).toBeInTheDocument();
    fireEvent.click(panel().getByRole("button", { name: "Create request contact" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/requestContacts",
      body: { "@type": "requestContact", id: "DENIC-1000022-GR", uriTemplate: "ftp://x.example/{domain}" },
    });
  });

  it("loads a request contact and changes its template with a partial update by default, or a full one", async () => {
    const { calls } = renderPage(<RequestContactsPage />, (call) =>
      call.path.endsWith("/schema") ? answer(presetSchema, { type: "application/schema+json" }) : answer(STORED),
    );
    openTab("Change");
    fireEvent.change(panel().getByLabelText("Handle"), { target: { value: "DENIC-1000022-GR" } });
    fireEvent.click(panel().getByRole("button", { name: "Load request contact" }));
    const field = await panel().findByLabelText("URI Template");
    expect(field).toHaveValue(TEMPLATE);
    expect(panel().getByRole("button", { name: "Save template" })).toBeDisabled();
    fireEvent.change(field, { target: { value: "mailto:abuse@example.com" } });
    fireEvent.click(panel().getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(panel().getByText("Request contact DENIC-1000022-GR changed")).toBeInTheDocument());
    expect(calls[1]).toMatchObject({
      method: "PATCH",
      path: "/requestContacts/DENIC-1000022-GR",
      body: [{ op: "replace", path: "/uriTemplate", value: "mailto:abuse@example.com" }],
    });

    fireEvent.change(panel().getByLabelText("URI Template"), { target: { value: "https://www.example.com/abuse/{Ulabel}" } });
    fireEvent.click(panel().getByRole("radio", { name: /Full update \(PUT\)/ }));
    expect(await panel().findByText(/Not sent, as an update does not hold them/)).toHaveTextContent("/id, /provMetadata");
    expect(calls.some((call) => call.path === "/presets/de.denic.rpp.preset.rri/schema")).toBe(true);
    fireEvent.click(panel().getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(calls.at(-1)?.method).toBe("PUT"));
    expect(calls.at(-1)).toMatchObject({
      path: "/requestContacts/DENIC-1000022-GR",
      body: { "@type": "requestContact", uriTemplate: "https://www.example.com/abuse/{Ulabel}" },
    });
  });
});

const DOMAIN = {
  "@type": "domainName",
  name: "foo.de",
  provMetadata: { "@type": "provMetadata", spClientId: "DENIC-1000022" },
  status: [{ "@type": "domainStatus", label: "ok" }],
  registrant: { "@type": "contact", id: "DENIC-1000022-HOLDER" },
  contacts: [{ label: "registrant", object: { "@type": "contact", id: "DENIC-1000022-HOLDER2" } }],
  generalRequest: { "@type": "requestContact", id: "DENIC-1000022-GR" },
  abuse: { "@type": "requestContact", id: "DENIC-1000022-AB" },
};

const typeName = (value: string) => fireEvent.change(panel().getByLabelText("Domain name"), { target: { value } });

describe("domain names under DENIC RRI", () => {
  it("shows the request contacts of a domain with links, not as unknown members", async () => {
    renderPage(<DomainsPage />, () => answer(DOMAIN));
    typeName("foo.de");
    fireEvent.click(panel().getByRole("button", { name: "Get info" }));
    await waitFor(() => expect(panel().getByText("Found foo.de")).toBeInTheDocument());
    expect(panel().getByRole("link", { name: "DENIC-1000022-GR" })).toHaveAttribute("href", "/request-contacts?tab=info&name=DENIC-1000022-GR&run=1");
    expect(panel().getByRole("link", { name: "DENIC-1000022-AB" })).toBeInTheDocument();
    expect(panel().queryByText("Other members")).toBeNull();
  });

  it("keeps them as unknown members while the extension is not in effect", async () => {
    renderPage(<DomainsPage />, () => answer(DOMAIN), discoveryWith({ rriDefault: false }));
    typeName("foo.de");
    fireEvent.click(panel().getByRole("button", { name: "Get info" }));
    await waitFor(() => expect(panel().getByText("Found foo.de")).toBeInTheDocument());
    expect(panel().getByText("Other members")).toBeInTheDocument();
    expect(panel().queryByRole("link", { name: "DENIC-1000022-GR" })).toBeNull();
  });

  it("registers with the holders and the request contacts", async () => {
    const { calls } = renderPage(<DomainsPage />, () => answer(DOMAIN, { status: 201 }));
    openTab("Register");
    typeName("foo.de");
    fireEvent.change(panel().getByLabelText("Registrant"), { target: { value: "DENIC-1000022-HOLDER" } });
    fireEvent.click(panel().getByRole("button", { name: "Add a contact" }));
    const role = panel().getByRole("combobox", { name: "Role of contact 1" });
    expect(within(role).getAllByRole("option").map((option) => option.textContent)).toEqual(["Choose a role", "registrant"]);
    fireEvent.change(role, { target: { value: "registrant" } });
    fireEvent.change(panel().getByLabelText("Identifier of contact 1"), { target: { value: "DENIC-1000022-HOLDER2" } });
    fireEvent.change(panel().getByLabelText("General request contact"), { target: { value: "DENIC-1000022-GR" } });
    fireEvent.change(panel().getByLabelText("Abuse contact"), { target: { value: "DENIC-1000022-AB" } });
    fireEvent.click(panel().getByRole("button", { name: "Register domain" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      "@type": "domainName",
      name: "foo.de",
      registrant: { "@type": "contact", id: "DENIC-1000022-HOLDER" },
      contacts: [{ label: "registrant", object: { "@type": "contact", id: "DENIC-1000022-HOLDER2" } }],
      generalRequest: { "@type": "requestContact", id: "DENIC-1000022-GR" },
      abuse: { "@type": "requestContact", id: "DENIC-1000022-AB" },
    });
  });

  it("offers neither the request contacts nor the holder role without the extension", () => {
    renderPage(<DomainsPage />, () => answer(DOMAIN), discoveryWith({ advertised: false }));
    openTab("Register");
    expect(panel().queryByLabelText("General request contact")).toBeNull();
    fireEvent.click(panel().getByRole("button", { name: "Add a contact" }));
    const role = panel().getByRole("combobox", { name: "Role of contact 1" });
    expect(within(role).getAllByRole("option").map((option) => option.textContent)).toEqual(["Choose a role", "admin", "billing", "tech"]);
  });

  it("changes the request contacts with a partial update, shown before sending", async () => {
    const { calls } = renderPage(<DomainsPage />, () => answer(DOMAIN));
    openTab("Change");
    typeName("foo.de");
    fireEvent.click(panel().getByRole("button", { name: "Load the domain" }));
    const abuse = await panel().findByLabelText("Abuse contact");
    expect(abuse).toHaveValue("DENIC-1000022-AB");
    fireEvent.change(abuse, { target: { value: "DENIC-1000022-AB2" } });
    fireEvent.change(panel().getByLabelText("General request contact"), { target: { value: "" } });
    const summary = panel().getByRole("region", { name: "Changes to send" });
    expect(summary).toHaveTextContent("Remove general request contact");
    expect(summary).toHaveTextContent("Replace the abuse contact with DENIC-1000022-AB2");
    fireEvent.click(panel().getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({
      method: "PATCH",
      body: [
        { op: "remove", path: "/generalRequest" },
        { op: "replace", path: "/abuse", value: { "@type": "requestContact", id: "DENIC-1000022-AB2" } },
      ],
    });
  });

  it("sends a full update when the connection says so: the update view, without what only the server sets", async () => {
    const { calls } = renderPage(
      <DomainsPage />,
      (call) => (call.path.endsWith("/schema") ? answer(presetSchema, { type: "application/schema+json" }) : answer(DOMAIN)),
      discoveryWith(),
      "/",
      DEFAULT_PRESET_SETTINGS,
      "full",
    );
    openTab("Change");
    typeName("foo.de");
    fireEvent.click(panel().getByRole("button", { name: "Load the domain" }));
    fireEvent.change(await panel().findByLabelText("Abuse contact"), { target: { value: "DENIC-1000022-AB2" } });
    expect(panel().getByRole("radio", { name: /Full update \(PUT\)/ })).toBeChecked();
    // The password is left alone: it is not in the body, and the PUT does not name it, so the server keeps it.
    expect(await panel().findByLabelText("Body of the full update")).not.toHaveTextContent("authInfo");
    expect(panel().queryByText(/includeElements/)).not.toBeInTheDocument();
    expect(panel().getByRole("button", { name: "Save changes" })).toBeEnabled();

    // Setting it makes it part of the PUT: named in includeElements, and the body carries it (hidden on screen).
    fireEvent.click(panel().getByRole("radio", { name: "Set a new one" }));
    fireEvent.change(panel().getByLabelText("New transfer password"), { target: { value: "Abc2345678" } });
    expect(panel().getByLabelText("Body of the full update")).not.toHaveTextContent("Abc2345678");
    expect(panel().getByText("?includeElements=authInfo")).toBeInTheDocument();
    expect(panel().getByText(/Left without a value/).closest("[role=status]")).toHaveTextContent("nameservers");
    fireEvent.click(panel().getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.at(-1)?.method).toBe("PUT"));
    expect(calls.at(-1)).toMatchObject({ path: "/domainNames/foo.de?includeElements=authInfo" });
    expect(calls.at(-1)?.body).toEqual({
      "@type": "domainName",
      status: [],
      registrant: { "@type": "contact", id: "DENIC-1000022-HOLDER" },
      contacts: [{ label: "registrant", object: { "@type": "contact", id: "DENIC-1000022-HOLDER2" } }],
      generalRequest: { "@type": "requestContact", id: "DENIC-1000022-GR" },
      abuse: { "@type": "requestContact", id: "DENIC-1000022-AB2" },
      authInfo: { "@type": "authInfo", method: "authinfo", authdata: "Abc2345678" },
    });
  });

  it("shows the body of a partial update too, with the password hidden", async () => {
    renderPage(<DomainsPage />, () => answer(DOMAIN), discoveryWith());
    openTab("Change");
    typeName("foo.de");
    fireEvent.click(panel().getByRole("button", { name: "Load the domain" }));
    fireEvent.change(await panel().findByLabelText("Abuse contact"), { target: { value: "DENIC-1000022-AB2" } });
    fireEvent.click(panel().getByRole("radio", { name: "Set a new one" }));
    fireEvent.change(panel().getByLabelText("New transfer password"), { target: { value: "Abc2345678" } });
    const body = panel().getByLabelText("Body of the partial update");
    expect(body).toHaveTextContent('"path": "/abuse"');
    expect(body).toHaveTextContent('"path": "/authInfo"');
    expect(body).not.toHaveTextContent("Abc2345678");
    expect(panel().queryByLabelText("Body of the full update")).not.toBeInTheDocument();
  });

  it("sends a full update without the password, and without includeElements, when the form leaves it alone", async () => {
    const { calls } = renderPage(
      <DomainsPage />,
      (call) => (call.path.endsWith("/schema") ? answer(presetSchema, { type: "application/schema+json" }) : answer(DOMAIN)),
      discoveryWith(),
      "/",
      DEFAULT_PRESET_SETTINGS,
      "full",
    );
    openTab("Change");
    typeName("foo.de");
    fireEvent.click(panel().getByRole("button", { name: "Load the domain" }));
    fireEvent.change(await panel().findByLabelText("Abuse contact"), { target: { value: "DENIC-1000022-AB2" } });
    await panel().findByLabelText("Body of the full update");
    fireEvent.click(panel().getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.at(-1)?.method).toBe("PUT"));
    expect(calls.at(-1)).toMatchObject({ path: "/domainNames/foo.de" });
    expect(calls.at(-1)?.body).not.toHaveProperty("authInfo");
  });

  it("transfers with the domain data the registry asks for, completed at once", async () => {
    const { calls } = renderPage(<DomainsPage />, () =>
      answer({ "@type": "domainTransferProcess", trStatus: "serverApproved", reqClientId: "DENIC-1000002", actClientId: "DENIC-1000002" }),
    );
    openTab("Transfer");
    typeName("foo.de");
    expect(panel().queryByRole("radio")).toBeNull();
    expect(panel().getByText("A transfer here is completed at once")).toBeInTheDocument();

    fireEvent.change(panel().getByLabelText("Transfer password"), { target: { value: "Abc2345678" } });
    fireEvent.click(panel().getByRole("button", { name: "Ask for the transfer" }));
    expect(await panel().findByText("Enter the registrant: the registry needs it with the transfer")).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    const section = within(panel().getByRole("region", { name: "Domain data after the transfer" }));
    fireEvent.change(section.getByLabelText("Registrant"), { target: { value: "DENIC-1000002-HOLDER" } });
    fireEvent.change(section.getByLabelText("General request contact"), { target: { value: "DENIC-1000002-GENERAL" } });
    const ns = within(section.getByRole("group", { name: "DNS record 1" }));
    fireEvent.change(ns.getByLabelText("Name server"), { target: { value: "ns1.foo.de" } });
    fireEvent.click(section.getByRole("button", { name: "Add a glue record" }));
    const glue = within(section.getByRole("group", { name: "DNS record 2" }));
    fireEvent.change(glue.getByLabelText("Name"), { target: { value: "ns1" } });
    fireEvent.change(glue.getByLabelText("IPv4 address"), { target: { value: "2001:db8::1" } });
    fireEvent.click(section.getByRole("button", { name: "Add an MX record" }));
    fireEvent.change(within(section.getByRole("group", { name: "DNS record 3" })).getByLabelText("Mail server"), { target: { value: "mail.example.com." } });
    expect(section.queryByRole("button", { name: "Add a DS record" })).toBeNull();
    fireEvent.click(section.getByRole("button", { name: "Add a DNSKEY record" }));
    const key = within(section.getByRole("group", { name: "DNSKEY record 1" }));
    fireEvent.change(key.getByLabelText("Flags"), { target: { value: "257" } });
    fireEvent.change(key.getByLabelText("Protocol"), { target: { value: "3" } });
    fireEvent.change(key.getByLabelText("Algorithm"), { target: { value: "13" } });
    fireEvent.change(key.getByLabelText("Public key"), { target: { value: "AwEAAa==" } });

    fireEvent.click(panel().getByRole("button", { name: "Ask for the transfer" }));
    expect(await section.findByText("Enter an IPv4 address")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    fireEvent.change(glue.getByLabelText("IPv4 address"), { target: { value: "192.0.2.1" } });
    fireEvent.click(panel().getByRole("button", { name: "Ask for the transfer" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.path).toBe("/domainNames/foo.de/processes/transferProcesses");
    expect(calls[0]?.headers.get("RPP-Authorization")).toBe(`authinfo value=${btoa("Abc2345678")}`);
    expect(calls[0]?.body).toEqual({
      "@type": "domainTransferProcess",
      registrant: { "@type": "contact", id: "DENIC-1000002-HOLDER" },
      generalRequest: { "@type": "requestContact", id: "DENIC-1000002-GENERAL" },
      dns: {
        "@type": "dnsData",
        records: [
          { "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns1.foo.de" } },
          { "@type": "dnsRecord", name: "ns1", type: "a", rdata: { address: "192.0.2.1" } },
          { "@type": "dnsRecord", name: "@", type: "mx", rdata: { preference: "10", exchange: "mail.example.com." } },
          { "@type": "dnsRecord", name: "@", type: "dnskey", rdata: { flags: "257", protocol: "3", algorithm: "13", publicKey: "AwEAAa==" } },
        ],
      },
    });
    expect(await panel().findByText("serverApproved")).toBeInTheDocument();
  });
});
