// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectionContext, type ConnectionApi } from "@/app/connection-context";
import { DiscoveryContext } from "@/app/discovery-context";
import { Providers } from "@/app/providers";
import { resolvePreset } from "@/application/connection/preset";
import { createSession } from "@/application/connection/session";
import { DEFAULT_PRESET_SETTINGS } from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { parseDiscoveryDocument } from "@/rpp/discovery/parseDiscoveryDocument";
import { contactPresetSchema, type ContactProfileFixture } from "@/test/contactPresetSchemas";
import { ContactsPage } from "./ContactsPage";

const PROFILE = { baseUrl: "https://rpp.example.test/rpp", allowInsecureHttp: false, auth: { type: "none" }, preset: DEFAULT_PRESET_SETTINGS, updateMode: "partial" } as const;

const SOURCE = {
  url: "https://rpp.example.test/.well-known/rpp",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  exchangeId: "x-1",
  correlation: { clientTransactionId: null, serverTransactionId: null, resultCode: null },
};

const discoveryWith = (objects: string[], presetId = "p"): DiscoveryState => ({
  status: "ready",
  snapshot: parseDiscoveryDocument(
    {
      "@type": "discovery",
      versions: [{ version: "1.0", baseUrl: PROFILE.baseUrl }],
      environment: { name: "test", status: "stable" },
      tlds: ["test"],
      presets: [{ id: presetId, version: "1.0", defaultPreset: true, extensions: [] }],
      objects,
      datetime: "2026-01-01T00:00:00Z",
    },
    SOURCE,
  ).snapshot,
});

const CONTACT = {
  "@type": "contact",
  id: "FO-1",
  provMetadata: { "@type": "provMetadata", spClientId: "REG-1", crDate: "2024-01-01T00:00:00Z" },
  status: [{ "@type": "contactStatus", label: "ok" }, { "@type": "contactStatus", label: "clientTransferProhibited" }],
  contactInfo: {
    "@type": "Card",
    version: "2.0",
    kind: "individual",
    name: { full: "John Doe" },
    addresses: { addr: { components: [{ kind: "name", value: "123 Main St" }, { kind: "locality", value: "Reston" }], countryCode: "US" } },
    phones: { voice: { number: "tel:+1.7035555555" } },
    emails: { email: { address: "jdoe@example.test" } },
  },
  weird: { extra: true },
};

type Responder = (request: { method: string; path: string; headers: Headers; body: unknown }) => Response | Promise<Response>;

const answer = (body: unknown, init: { status?: number; code?: string } = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/rpp+json" }), "RPP-Code": init.code ?? "01000", "RPP-Svtrid": "S-7" },
  });

const snapshotOf = (discovery: DiscoveryState) => (discovery.status === "ready" || discovery.status === "partial" ? discovery.snapshot : undefined);

/** The Preset Schema of the first preset is served as the registry would; `profile` is what constrains `contact.create` in it. */
function renderPage(responder: Responder, discovery: DiscoveryState = discoveryWith(["contact"]), profile: ContactProfileFixture = "none", entry = "/") {
  const calls: { method: string; path: string; headers: Headers; body: unknown }[] = [];
  const schemaCalls: string[] = [];
  const preset = snapshotOf(discovery)?.presets[0];
  const session = createSession(PROFILE, undefined, {
    fetch: async (input, init) => {
      const url = input as URL;
      if (preset && url.pathname.startsWith("/rpp/presets/")) {
        schemaCalls.push(url.pathname);
        return new Response(JSON.stringify(contactPresetSchema({ id: preset.id, version: preset.version }, profile)), {
          status: 200,
          headers: { "Content-Type": "application/schema+json", "RPP-Code": "01000", "RPP-Svtrid": "S-1" },
        });
      }
      const request = {
        method: init?.method ?? "GET",
        path: `${url.pathname}${url.search}`.replace("/rpp", ""),
        headers: new Headers(init?.headers),
        body: init?.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown),
      };
      calls.push(request);
      return responder(request);
    },
  });
  render(
    <Providers>
      <MemoryRouter initialEntries={[entry]}>
        <ConnectionContext.Provider value={{ session, resolvedPreset: resolvePreset(DEFAULT_PRESET_SETTINGS, snapshotOf(discovery)) } as ConnectionApi}>
          <DiscoveryContext.Provider value={discovery}>
            <ContactsPage />
          </DiscoveryContext.Provider>
        </ConnectionContext.Provider>
      </MemoryRouter>
    </Providers>,
  );
  return { session, calls, schemaCalls };
}

const panel = () => within(screen.getByRole("tabpanel"));
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
/** Opens a tab with a form that waits for the Preset Schema, and waits for the form. */
const openForm = async (name: string) => {
  openTab(name);
  await panel().findByLabelText("Name");
};
const typeId = (value: string) => fireEvent.change(panel().getByLabelText("Contact identifier"), { target: { value } });
const fill = (label: string, value: string) => fireEvent.change(panel().getByLabelText(label), { target: { value } });

describe("a link to a contact", () => {
  it("opens the info of the contact and asks the registry for it at once", async () => {
    const { calls } = renderPage(() => answer(CONTACT), discoveryWith(["contact"]), "none", "/contacts?tab=info&name=C-1&run=1");
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "GET", path: "/contacts/C-1" });
    expect(panel().getByLabelText("Contact identifier")).toHaveValue("C-1");
    expect(await panel().findByText("Found C-1")).toBeInTheDocument();
  });

  it("only fills in the identifier without the run flag", () => {
    const { calls } = renderPage(() => answer(CONTACT), discoveryWith(["contact"]), "none", "/contacts?tab=info&name=C-1");
    expect(panel().getByLabelText("Contact identifier")).toHaveValue("C-1");
    expect(calls).toHaveLength(0);
  });
});

describe("contacts screen", () => {
  it("waits for a connection, and does not offer what a server without contacts cannot do", () => {
    renderPage(() => answer({}), { status: "not-started" });
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("says so when the server has no contacts", () => {
    renderPage(() => answer({}), discoveryWith(["domainName"]));
    expect(screen.getByRole("status")).toHaveTextContent("This server does not offer contacts");
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("has a tab for each workflow", () => {
    renderPage(() => answer({}));
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Info", "Check", "Create", "Change", "Transfer", "Delete"]);
  });

  it("looks a contact up and shows all of it", async () => {
    const { calls } = renderPage(() => answer(CONTACT));
    typeId(" FO-1 ");
    fireEvent.click(panel().getByRole("button", { name: "Get info" }));
    await waitFor(() => expect(panel().getByText("Found FO-1")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "GET", path: "/contacts/FO-1" });
    expect(calls[0]?.headers.get("RPP-Cltrid")).toMatch(/^rpp-client-\d{8}$/);

    const view = panel();
    expect(view.getByRole("list", { name: "Status" })).toHaveTextContent("clientTransferProhibited");
    expect(view.getByText("John Doe", { selector: "span" })).toBeInTheDocument();
    expect(view.getByText("123 Main St")).toBeInTheDocument();
    expect(view.getByText("+1.7035555555")).toBeInTheDocument();
    expect(view.getByText("jdoe@example.test")).toBeInTheDocument();
    expect(view.getByText("REG-1")).toBeInTheDocument();
    expect(view.getByText("weird")).toBeInTheDocument();
  });

  it("explains a refusal with the registry's own reason", async () => {
    renderPage(() =>
      new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "Not Found", errors: [{ type: "t", result: "02303", reason: "No such contact" }] }), {
        status: 404,
        headers: { "Content-Type": "application/problem+json", "RPP-Code": "02303" },
      }),
    );
    typeId("nope");
    fireEvent.click(panel().getByRole("button", { name: "Get info" }));
    expect(await panel().findByRole("alert")).toHaveTextContent("No such contact");
  });
});

describe("check and create", () => {
  it("checks the identifier and moves on to creating", async () => {
    const { calls } = renderPage(() => answer({ "@type": "contactAvailability", available: true }));
    openTab("Check");
    typeId("NEW-1");
    fireEvent.click(panel().getByRole("button", { name: "Check availability" }));
    await waitFor(() => expect(panel().getByText("Available")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "GET", path: "/contacts/NEW-1/availability" });
    fireEvent.click(panel().getByRole("button", { name: "Create this contact" }));
    expect(screen.getByRole("tab", { name: "Create" })).toHaveAttribute("aria-selected", "true");
    expect(panel().getByLabelText("Contact identifier")).toHaveValue("NEW-1");
  });

  it("creates with the card built from the form", async () => {
    const { calls } = renderPage(() => answer(CONTACT, { status: 201 }));
    await openForm("Create");
    typeId("FO-1");
    fill("Name", "John Doe");
    fill("Kind", "individual");
    fill("Street, line 1", "123 Main St");
    fill("City", "Reston");
    fill("Country code", "US");
    fill("Phone", "+1.7035555555");
    fill("Email", "jdoe@example.test");
    fireEvent.click(panel().getByRole("button", { name: "Create contact" }));

    await waitFor(() => expect(panel().getByText("Created FO-1")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/contacts",
      body: {
        "@type": "contact",
        id: "FO-1",
        contactInfo: {
          "@type": "Card",
          version: "2.0",
          kind: "individual",
          name: { full: "John Doe" },
          addresses: { addr: { components: [{ kind: "name", value: "123 Main St" }, { kind: "locality", value: "Reston" }], countryCode: "US" } },
          phones: { voice: { number: "tel:+1.7035555555" } },
          emails: { email: { address: "jdoe@example.test" } },
        },
      },
    });
  });

  it("flags a phone number, a country and an email that are not in the form the registry takes, before sending", async () => {
    const { calls } = renderPage(() => answer(CONTACT, { status: 201 }));
    await openForm("Create");
    typeId("FO-2");
    fill("Phone", "020 1234567");
    fill("Country code", "nl");
    fill("Email", "not an email");
    fireEvent.click(panel().getByRole("button", { name: "Create contact" }));
    expect(await panel().findByText("Use +CC.number, like +31.201234567")).toBeInTheDocument();
    expect(panel().getByText("Use two capital letters, like NL")).toBeInTheDocument();
    expect(panel().getByText("Enter an email address")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("shows the international and the localized address together on Create, each with its own country", async () => {
    renderPage(() => answer(CONTACT, { status: 201 }));
    await openForm("Create");
    expect(panel().queryByRole("combobox", { name: /Address type/ })).toBeNull();
    expect(panel().getByText("International address (int)")).toBeVisible();
    expect(panel().getByText("Localized address (loc)")).toBeVisible();
    expect(panel().getByLabelText("City")).toBeVisible();
    expect(panel().getByLabelText("Localized city")).toBeVisible();
    expect(panel().getByLabelText("Country code")).toBeVisible();
    expect(panel().getByLabelText("Localized country code")).toBeVisible();
  });

  it("sends the international address in the card and the localized one in its localization", async () => {
    const { calls } = renderPage(() => answer(CONTACT, { status: 201 }));
    await openForm("Create");
    typeId("FO-4");
    fill("Name", "Jorg Muller");
    fill("Email", "j@example.test");
    fill("City", "Munich");
    fill("Country code", "DE");
    fill("Localized street, line 1", "Hauptstraße 1");
    fill("Localized city", "München");
    fill("Localized country code", "DE");
    fireEvent.click(panel().getByRole("button", { name: "Create contact" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({
      contactInfo: {
        addresses: { addr: { components: [{ kind: "locality", value: "Munich" }], countryCode: "DE" } },
        localizations: { und: { addresses: { addr: { components: [{ kind: "name", value: "Hauptstraße 1" }, { kind: "locality", value: "München" }], countryCode: "DE" } } } },
      },
    });
  });

  it("sends no localization when the localized address is empty", async () => {
    const { calls } = renderPage(() => answer(CONTACT, { status: 201 }));
    await openForm("Create");
    typeId("FO-7");
    fill("City", "Utrecht");
    fill("Country code", "NL");
    fireEvent.click(panel().getByRole("button", { name: "Create contact" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.stringify(calls[0]?.body)).not.toContain("localizations");
  });

  it("keeps characters outside ASCII out of the international address", async () => {
    const { calls } = renderPage(() => answer(CONTACT, { status: 201 }));
    await openForm("Create");
    typeId("FO-5");
    fill("City", "München");
    fill("Country code", "DE");
    fireEvent.click(panel().getByRole("button", { name: "Create contact" }));
    expect(await panel().findByText("Use plain ASCII here; put other characters in the localized address")).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  it("asks for the country of the localized address when part of it is given", async () => {
    const { calls } = renderPage(() => answer(CONTACT, { status: 201 }));
    await openForm("Create");
    typeId("FO-8");
    fill("Localized city", "München");
    fireEvent.click(panel().getByRole("button", { name: "Create contact" }));
    expect(await panel().findByText("Enter the localized country code")).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  it("asks for the country when part of an address is given", async () => {
    const { calls } = renderPage(() => answer(CONTACT, { status: 201 }));
    await openForm("Create");
    typeId("FO-3");
    fill("City", "Utrecht");
    fireEvent.click(panel().getByRole("button", { name: "Create contact" }));
    expect(await panel().findByText("Enter the country code")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("does not send a contact without an identifier", async () => {
    const { calls } = renderPage(() => answer(CONTACT, { status: 201 }));
    await openForm("Create");
    fireEvent.click(panel().getByRole("button", { name: "Create contact" }));
    expect(await panel().findByRole("alert")).toHaveTextContent("Enter a contact identifier");
    expect(calls).toHaveLength(0);
  });
});

describe("under a preset that keeps the postal info in the localization only", () => {
  const SIDN = () => discoveryWith(["contact"], "nl.sidn.rpp.preset.epp-compatible");
  const LOCALIZED_CONTACT = {
    ...CONTACT,
    contactInfo: {
      "@type": "Card",
      version: "2.0",
      kind: "individual",
      localizations: {
        und: {
          name: { full: "Jan Jansen" },
          addresses: { addr: { components: [{ kind: "name", value: "Dorpsstraat 1" }, { kind: "locality", value: "Arnhem" }], countryCode: "NL" } },
        },
      },
      phones: { voice: { number: "tel:+31.201234567" } },
      emails: { email: { address: "jan@example.test" } },
    },
  };

  it("offers the postal info once, as the localized one, and no transfer password", async () => {
    const { schemaCalls } = renderPage(() => answer(CONTACT, { status: 201 }), SIDN(), "localized-only");
    await openForm("Create");
    expect(schemaCalls).toEqual(["/rpp/presets/nl.sidn.rpp.preset.epp-compatible/schema"]);
    expect(panel().queryByText("International address (int)")).toBeNull();
    expect(panel().queryByLabelText("City")).toBeNull();
    expect(panel().getByLabelText("Localized city")).toBeVisible();
    expect(panel().queryByLabelText("Authorisation Information")).toBeNull();
  });

  it("shows every localized address of the response with the keys it is held under", async () => {
    const second = { addr2: { components: [{ kind: "locality", value: "Zwolle" }], countryCode: "NL" } };
    const contact = structuredClone(LOCALIZED_CONTACT);
    Object.assign(contact.contactInfo.localizations.und.addresses, second);
    renderPage(() => answer(contact, { status: 201 }), SIDN(), "localized-only");
    await openForm("Create");
    typeId("FO-9");
    fill("Name", "Jan Jansen");
    fireEvent.click(panel().getByRole("button", { name: "Create contact" }));

    expect(await panel().findAllByText("und")).toHaveLength(2);
    expect(panel().queryByText(/localizations\//)).toBeNull();
    expect(panel().getByText("Arnhem")).toBeVisible();
    expect(panel().getByText("Zwolle")).toBeVisible();
    expect(panel().queryByText("Other forms")).toBeNull();
  });

  it("sends the name and the address in the localization and nothing of them in the card", async () => {
    const { calls } = renderPage(() => answer(LOCALIZED_CONTACT, { status: 201 }), SIDN(), "localized-only");
    await openForm("Create");
    typeId("FO-9");
    fill("Name", "Jan Jansen");
    fill("Email", "jan@example.test");
    fill("Localized street, line 1", "Dorpsstraat 1");
    fill("Localized city", "Arnhem");
    fill("Localized country code", "NL");
    fireEvent.click(panel().getByRole("button", { name: "Create contact" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const card = (calls[0]!.body as { contactInfo: Record<string, unknown> }).contactInfo;
    expect(card).not.toHaveProperty("name");
    expect(card).not.toHaveProperty("addresses");
    expect(card).toMatchObject({
      localizations: {
        und: {
          name: { full: "Jan Jansen" },
          addresses: { addr: { components: [{ kind: "name", value: "Dorpsstraat 1" }, { kind: "locality", value: "Arnhem" }], countryCode: "NL" } },
        },
      },
    });
  });

  it("reads the name and the address from the localization and changes them there", async () => {
    const { calls } = renderPage((request) => (request.method === "PATCH" ? answer(LOCALIZED_CONTACT) : answer(LOCALIZED_CONTACT)), SIDN(), "localized-only");
    openTab("Change");
    typeId("FO-1");
    fireEvent.click(panel().getByRole("button", { name: "Load the contact" }));
    await waitFor(() => expect(panel().getByLabelText("Name")).toHaveValue("Jan Jansen"));
    expect(panel().getByLabelText("Localized city")).toHaveValue("Arnhem");
    fill("Localized city", "Zwolle");
    fireEvent.click(panel().getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.at(-1)?.method).toBe("PATCH"));
    const sent = JSON.stringify(calls.at(-1)?.body);
    expect(sent).toContain("/contactInfo/localizations/und/");
    expect(sent).not.toContain('"/contactInfo/addresses');
  });
});

describe("under a preset that keeps the postal info in the card only", () => {
  it("offers the international address alone", async () => {
    renderPage(() => answer(CONTACT, { status: 201 }), discoveryWith(["contact"], "p"), "card-only");
    await openForm("Create");
    expect(panel().getByLabelText("City")).toBeVisible();
    expect(panel().queryByLabelText("Localized city")).toBeNull();
    expect(panel().queryByText("Localized address (loc)")).toBeNull();
    expect(panel().getByLabelText("Authorisation Information")).toBeVisible();
  });

  it("shows the authorisation information only when asked", async () => {
    renderPage(() => answer(CONTACT, { status: 201 }), discoveryWith(["contact"], "p"), "card-only");
    await openForm("Create");
    const field = panel().getByLabelText("Authorisation Information");
    expect(field).toHaveAttribute("type", "password");
    fireEvent.click(panel().getByRole("button", { name: "Show" }));
    expect(field).toHaveAttribute("type", "text");
    fireEvent.click(panel().getByRole("button", { name: "Hide" }));
    expect(field).toHaveAttribute("type", "password");
  });

  it("offers no choice of address type when a contact is changed", async () => {
    renderPage(() => answer(CONTACT), discoveryWith(["contact"], "p"), "card-only");
    openTab("Change");
    typeId("FO-1");
    fireEvent.click(panel().getByRole("button", { name: "Load the contact" }));
    await waitFor(() => expect(panel().getByLabelText("Name")).toHaveValue("John Doe"));
    expect(panel().queryByRole("combobox", { name: /Address type/ })).toBeNull();
    expect(panel().getByLabelText("City")).toBeVisible();
    expect(panel().queryByLabelText("Localized city")).toBeNull();
  });
});

describe("when the Preset Schema cannot be read", () => {
  it("offers every field, says why, and leaves the decision to the server", async () => {
    const discovery = discoveryWith(["contact"]);
    const session = createSession(PROFILE, undefined, {
      fetch: async () => new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "Not Found" }), { status: 404, headers: { "Content-Type": "application/problem+json", "RPP-Code": "02303" } }),
    });
    render(
      <Providers>
        <MemoryRouter>
          <ConnectionContext.Provider value={{ session, resolvedPreset: resolvePreset(DEFAULT_PRESET_SETTINGS, snapshotOf(discovery)) } as ConnectionApi}>
            <DiscoveryContext.Provider value={discovery}>
              <ContactsPage />
            </DiscoveryContext.Provider>
          </ConnectionContext.Provider>
        </MemoryRouter>
      </Providers>,
    );
    await openForm("Create");
    expect(panel().getByText("The preset schema did not shape this form")).toBeVisible();
    expect(panel().getByText("International address (int)")).toBeVisible();
    expect(panel().getByText("Localized address (loc)")).toBeVisible();
  });
});

describe("change", () => {
  it("loads the contact, shows what will be sent and sends only that", async () => {
    const changed = { ...CONTACT, contactInfo: { ...CONTACT.contactInfo, emails: { email: { address: "new@example.test" } } } };
    const { calls } = renderPage((request) => (request.method === "PATCH" ? answer(changed) : answer(CONTACT)));
    openTab("Change");
    typeId("FO-1");
    expect(panel().getByText("Load the contact to change it")).toBeInTheDocument();
    fireEvent.click(panel().getByRole("button", { name: "Load the contact" }));
    await waitFor(() => expect(panel().getByLabelText("Email")).toHaveValue("jdoe@example.test"));
    expect(panel().getByLabelText("Name")).toHaveValue("John Doe");
    expect(panel().getByLabelText("Phone")).toHaveValue("+1.7035555555");
    expect(panel().queryByLabelText("Kind")).toBeNull();
    const type = panel().getByRole("combobox", { name: /Address type/ });
    expect(within(type).getAllByRole("option").map((option) => (option as HTMLOptionElement).value)).toEqual(["int", "loc"]);
    expect(panel().getByLabelText("City")).toBeVisible();
    expect(panel().getByLabelText("Localized city")).not.toBeVisible();
    fireEvent.change(type, { target: { value: "loc" } });
    expect(panel().getByLabelText("Localized city")).toBeVisible();
    fireEvent.change(type, { target: { value: "int" } });

    const save = panel().getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    fill("Email", "new@example.test");
    fireEvent.click(panel().getByRole("checkbox", { name: "clientDeleteProhibited" }));
    await waitFor(() => expect(save).toBeEnabled());
    const summary = panel().getByRole("region", { name: "Changes to send" });
    expect(summary).toHaveTextContent("Change the email address to new@example.test");
    expect(summary).toHaveTextContent("Add status clientDeleteProhibited");

    fireEvent.click(save);
    await waitFor(() => expect(panel().getByText("Changed FO-1")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({
      method: "PATCH",
      path: "/contacts/FO-1",
      body: [
        { op: "replace", path: "/contactInfo/emails/email/address", value: "new@example.test" },
        { op: "add", path: "/status", value: { "@type": "contactStatus", label: "clientDeleteProhibited" } },
      ],
    });
    await waitFor(() => expect(panel().getByLabelText("Email")).toHaveValue("new@example.test"));
    expect(panel().getByText("Changed FO-1")).toBeInTheDocument();
  });
});

describe("transfer and delete", () => {
  it("asks for a transfer with the password in the header only", async () => {
    const { calls } = renderPage(() => answer({ "@type": "transferProcess", trStatus: "pending", reqClientId: "ME", requestDate: "2026-01-01T00:00:00Z", actClientId: "THEM", actionDate: "2026-01-06T00:00:00Z" }));
    openTab("Transfer");
    typeId("FO-1");
    fireEvent.click(panel().getByRole("button", { name: "Ask for the transfer" }));
    expect(await panel().findByText("Enter the transfer password of the contact")).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    fill("Transfer password", "pw 123");
    fireEvent.click(panel().getByRole("button", { name: "Ask for the transfer" }));
    await waitFor(() => expect(panel().getByText("The registry took the transfer request")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "POST", path: "/contacts/FO-1/processes/transferProcesses", body: { "@type": "transferProcess", transferDir: "pull" } });
    expect(calls[0]?.headers.get("RPP-Authorization")).toBe(`authinfo value=${btoa("pw 123")}`);
    expect(JSON.stringify(calls[0]?.body)).not.toContain("pw 123");
    expect(panel().getByText("pending")).toBeInTheDocument();
  });

  it("asks before it approves", async () => {
    const { calls } = renderPage(() => answer(undefined));
    openTab("Transfer");
    typeId("FO-1");
    fireEvent.click(panel().getByRole("radio", { name: /Approve a transfer away from you/ }));
    fireEvent.click(panel().getByRole("button", { name: "Approve the transfer" }));
    expect(calls).toHaveLength(0);
    const confirm = panel().getByRole("group", { name: "Approve the transfer of FO-1?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Approve for FO-1" }));
    await waitFor(() => expect(panel().getByText("The transfer was approved")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "POST", path: "/contacts/FO-1/processes/transferProcesses/latest/transferApprove" });
  });

  it("needs the identifier typed before it deletes", async () => {
    const { calls } = renderPage(() => answer(undefined));
    openTab("Delete");
    typeId("FO-1");
    fireEvent.click(panel().getByRole("button", { name: "Delete this contact" }));
    const confirm = panel().getByRole("group", { name: "Delete FO-1?" });
    const button = within(confirm).getByRole("button", { name: "Delete FO-1" });
    expect(button).toBeDisabled();
    fireEvent.change(within(confirm).getByLabelText(/Type/), { target: { value: "FO-1" } });
    fireEvent.click(button);
    await waitFor(() => expect(panel().getByText("Deleted FO-1")).toBeInTheDocument());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/contacts/FO-1" });
  });
});
