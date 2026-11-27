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
import { OrganisationsPage } from "./OrganisationsPage";

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

const ORGANISATION = {
  "@type": "organisation",
  id: "ORG-1",
  provMetadata: { "@type": "provMetadata", spClientId: "REG-1", crDate: "2024-01-01T00:00:00Z" },
  status: [{ "@type": "organisationStatus", label: "ok" }],
  roles: { registrar: { "@type": "organisationRole", roleId: "1234" } },
  parent: { "@type": "organisation", id: "ORG-0" },
  contactInfo: { "@type": "Card", version: "2.0", name: { full: "Example Registrar" }, emails: { email: { address: "info@example.test" } } },
  contacts: [{ label: "admin", object: { "@type": "contact", id: "C-1" } }],
  users: [{ label: "admin", object: { "@type": "user", id: "U-1" } }],
  weird: { extra: true },
};

const USER = {
  "@type": "user",
  id: "U-1",
  details: { "@type": "Card", version: "2.0", name: { full: "Jane Doe" } },
  description: "Administrator",
  status: { "@type": "userStatus", label: "active" },
  organisation: { "@type": "organisation", id: "ORG-1" },
};

type Call = { method: string; path: string; body: unknown };
type Responder = (request: Call) => Response | Promise<Response>;

const answer = (body: unknown, init: { status?: number; code?: string } = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/rpp+json", "RPP-Code": init.code ?? "01000", "RPP-Svtrid": "S-7" },
  });

function renderPage(responder: Responder, discovery: DiscoveryState = discoveryWith(["organisation", "user"]), entry = "/") {
  const calls: Call[] = [];
  const session = createSession(PROFILE, undefined, {
    fetch: async (input, init) => {
      const url = input as URL;
      const request = {
        method: init?.method ?? "GET",
        path: `${url.pathname}${url.search}`.replace("/rpp", ""),
        body: init?.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown),
      };
      calls.push(request);
      return responder(request);
    },
  });
  const snapshot = discovery.status === "ready" ? discovery.snapshot : undefined;
  render(
    <Providers>
      <MemoryRouter initialEntries={[entry]}>
        <ConnectionContext.Provider value={{ session, resolvedPreset: resolvePreset(DEFAULT_PRESET_SETTINGS, snapshot) } as ConnectionApi}>
          <DiscoveryContext.Provider value={discovery}>
            <OrganisationsPage />
          </DiscoveryContext.Provider>
        </ConnectionContext.Provider>
      </MemoryRouter>
    </Providers>,
  );
  return { calls };
}

const panel = () => within(screen.getByRole("tabpanel"));
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const type = (label: string, value: string) => fireEvent.change(panel().getByLabelText(label), { target: { value } });
const press = (name: string) => fireEvent.click(panel().getByRole("button", { name }));

describe("a link to an organisation", () => {
  it("opens the info of the organisation and asks the registry for it at once", async () => {
    const { calls } = renderPage(() => answer(ORGANISATION), undefined, "/organisations?name=ORG-1&tab=info&run=1");
    await waitFor(() => expect(panel().getByText("Found ORG-1")).toBeInTheDocument());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/organisations/ORG-1" });
  });

  it("only fills in the identifier without the run flag", () => {
    const { calls } = renderPage(() => answer(ORGANISATION), undefined, "/organisations?name=ORG-1&tab=info");
    expect(panel().getByLabelText("Organisation identifier")).toHaveValue("ORG-1");
    expect(calls).toHaveLength(0);
  });
});

describe("organisations screen", () => {
  it("waits for a connection", () => {
    renderPage(() => answer({}), { status: "not-started" });
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("says so when the server has no organisations", () => {
    renderPage(() => answer({}), discoveryWith(["domainName"]));
    expect(screen.getByRole("status")).toHaveTextContent("This server does not offer organisations");
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("has tabs for the organisation and for its users", () => {
    renderPage(() => answer({}));
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Info", "Create", "Change", "Delete", "User info", "Create user", "Change user", "Delete user"]);
  });

  it("leaves out the user tabs when the server does not offer users", () => {
    renderPage(() => answer({}), discoveryWith(["organisation"]));
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Info", "Create", "Change", "Delete"]);
  });
});

describe("organisation info", () => {
  it("reads an organisation and shows its roles, contacts, users and what this client does not model", async () => {
    const { calls } = renderPage(() => answer(ORGANISATION));
    type("Organisation identifier", " ORG-1 ");
    press("Get info");
    await waitFor(() => expect(panel().getByText("Found ORG-1")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "GET", path: "/organisations/ORG-1" });

    const view = panel();
    expect(view.getByRole("list", { name: "Status" })).toHaveTextContent("ok");
    const dd = (term: string) => view.getByText(term, { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(dd("Roles")).toHaveTextContent("registrar");
    expect(dd("Roles")).toHaveTextContent("1234");
    expect(dd("Parent")).toHaveTextContent("ORG-0");
    expect(dd("Email")).toHaveTextContent("info@example.test");
    expect(dd("Contacts")).toHaveTextContent("admin");
    expect(dd("Contacts")).toHaveTextContent("C-1");
    expect(dd("Users")).toHaveTextContent("U-1");
    expect(view.getByText("weird")).toBeInTheDocument();
  });

  it("explains a refusal with the registry's own reason", async () => {
    renderPage(() =>
      new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "Not Found", errors: [{ type: "t", result: "02303", reason: "No such organisation" }] }), {
        status: 404,
        headers: { "Content-Type": "application/problem+json", "RPP-Code": "02303" },
      }),
    );
    type("Organisation identifier", "NOPE");
    press("Get info");
    expect(await panel().findByRole("alert")).toHaveTextContent("No such organisation");
  });

  it("does not send an organisation without an identifier", async () => {
    const { calls } = renderPage(() => answer(ORGANISATION));
    press("Get info");
    expect(await panel().findByRole("alert")).toHaveTextContent("Enter an organisation identifier");
    expect(calls).toHaveLength(0);
  });
});

describe("organisation create", () => {
  it("creates an organisation with its role, parent, contact information and contact", async () => {
    const { calls } = renderPage(() => answer(ORGANISATION, { status: 201 }));
    openTab("Create");
    type("Organisation identifier", "ORG-1");
    type("Role 1", "registrar");
    type("Role 1 identifier", "1234");
    type("Parent organisation", "ORG-0");
    type("Name", "Example Registrar");
    type("Email", "info@example.test");
    press("Add a contact");
    type("Contact 1 type", "admin");
    type("Contact 1 identifier", "C-1");
    fireEvent.click(panel().getByRole("checkbox", { name: "clientDeleteProhibited" }));
    press("Create organisation");

    await waitFor(() => expect(panel().getByText("Created ORG-1")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/organisations",
      body: {
        "@type": "organisation",
        id: "ORG-1",
        status: [{ "@type": "organisationStatus", label: "clientDeleteProhibited" }],
        roles: { registrar: { "@type": "organisationRole", roleId: "1234" } },
        parent: { "@type": "organisation", id: "ORG-0" },
        contactInfo: { "@type": "Card", name: { full: "Example Registrar" }, emails: { email: { address: "info@example.test" } } },
        contacts: [{ label: "admin", object: { "@type": "contact", id: "C-1" } }],
      },
    });
  });

  it("takes more than one role and does not let the last one go", async () => {
    const { calls } = renderPage(() => answer(ORGANISATION, { status: 201 }));
    openTab("Create");
    expect(panel().getByRole("button", { name: "Remove role 1" })).toBeDisabled();
    press("Add a role");
    type("Role 1", "registrar");
    type("Role 2", "reseller");
    press("Remove role 1");
    expect(panel().queryByLabelText("Role 2")).toBeNull();
    type("Organisation identifier", "ORG-2");
    press("Create organisation");
    await waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0]!.body as { roles: object }).roles).toEqual({ reseller: { "@type": "organisationRole" } });
  });

  it("flags a role without a type, a role given twice and a contact that is not whole, before sending", async () => {
    const { calls } = renderPage(() => answer(ORGANISATION, { status: 201 }));
    openTab("Create");
    type("Organisation identifier", "ORG-1");
    press("Create organisation");
    expect(await panel().findByText("Give the role a type")).toBeInTheDocument();

    press("Add a role");
    type("Role 1", "registrar");
    type("Role 2", "registrar");
    press("Add a contact");
    type("Contact 1 type", "admin");
    press("Create organisation");
    expect(await panel().findAllByText("The role registrar is given twice")).toHaveLength(2);
    expect(panel().getByText("Give the contact an identifier")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("does not send an organisation without an identifier", async () => {
    const { calls } = renderPage(() => answer(ORGANISATION, { status: 201 }));
    openTab("Create");
    type("Role 1", "registrar");
    press("Create organisation");
    expect(await panel().findByRole("alert")).toHaveTextContent("Enter an organisation identifier");
    expect(calls).toHaveLength(0);
  });
});

describe("organisation change", () => {
  it("loads the organisation, shows what will be sent and sends only that", async () => {
    const changed = { ...ORGANISATION, parent: { "@type": "organisation", id: "ORG-5" } };
    const { calls } = renderPage((request) => (request.method === "PATCH" ? answer(changed) : answer(ORGANISATION)));
    openTab("Change");
    type("Organisation identifier", "ORG-1");
    expect(panel().getByText("Load the organisation to change it")).toBeInTheDocument();
    press("Load the organisation");
    await waitFor(() => expect(panel().getByLabelText("Role 1")).toHaveValue("registrar"));
    expect(panel().getByLabelText("Role 1 identifier")).toHaveValue("1234");
    expect(panel().getByLabelText("Parent organisation")).toHaveValue("ORG-0");
    expect(panel().getByLabelText("Contact 1 identifier")).toHaveValue("C-1");

    const save = panel().getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    type("Parent organisation", "ORG-5");
    press("Add a role");
    type("Role 2", "reseller");
    fireEvent.click(panel().getByRole("checkbox", { name: /Prohibit linking to role 2/ }));
    await waitFor(() => expect(save).toBeEnabled());
    const summary = panel().getByRole("region", { name: "Changes to send" });
    expect(summary).toHaveTextContent("Set the parent organisation to ORG-5");
    expect(summary).toHaveTextContent("Add the role reseller");

    fireEvent.click(save);
    await waitFor(() => expect(panel().getByText("Changed ORG-1")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({
      method: "PATCH",
      path: "/organisations/ORG-1",
      body: [
        {
          op: "add",
          path: "/roles/reseller",
          value: { "@type": "organisationRole", status: [{ "@type": "organisationRoleStatus", label: "clientLinkProhibited" }] },
        },
        { op: "replace", path: "/parent/id", value: "ORG-5" },
      ],
    });
  });

  it("says what is wrong while the form is not complete, and does not offer to save", async () => {
    renderPage(() => answer(ORGANISATION));
    openTab("Change");
    type("Organisation identifier", "ORG-1");
    press("Load the organisation");
    await waitFor(() => expect(panel().getByLabelText("Role 1")).toHaveValue("registrar"));
    type("Role 1", "");
    await waitFor(() => expect(panel().getByRole("region", { name: "Changes to send" })).toHaveTextContent("Give every role a type"));
    expect(panel().getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
});

describe("users", () => {
  it("reads a user in its organisation", async () => {
    const { calls } = renderPage(() => answer(USER));
    openTab("User info");
    type("Organisation identifier", "ORG-1");
    type("User identifier", "U-1");
    press("Get info");
    await waitFor(() => expect(panel().getByText("Found U-1 in ORG-1")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ method: "GET", path: "/organisations/ORG-1/users/U-1" });
    const view = panel();
    const dd = (term: string) => view.getByText(term, { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(dd("Organisation")).toHaveTextContent("ORG-1");
    expect(dd("Name")).toHaveTextContent("Jane Doe");
    expect(dd("Description")).toHaveTextContent("Administrator");
    expect(view.getByRole("list", { name: "Status" })).toHaveTextContent("active");
  });

  it("creates a user in the organisation given, and says the identifier is only unique within it", async () => {
    const { calls } = renderPage(() => answer(USER, { status: 201 }));
    openTab("Create user");
    expect(panel().getByText(/only has to be unique within this organisation/)).toBeInTheDocument();
    type("Organisation identifier", "ORG-1");
    type("User identifier", "U-2");
    type("Name of the user", "John");
    type("Email", "john@example.test");
    type("Description", "Operator");
    type("Status", "suspended");
    press("Create user");

    await waitFor(() => expect(panel().getByText("Created U-2 in ORG-1")).toBeInTheDocument());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/organisations/ORG-1/users",
      body: {
        "@type": "user",
        id: "U-2",
        details: { "@type": "Card", name: { full: "John" }, emails: { email: { address: "john@example.test" } } },
        description: "Operator",
        status: { "@type": "userStatus", label: "suspended" },
      },
    });
  });

  it("does not create a user without an organisation", async () => {
    const { calls } = renderPage(() => answer(USER, { status: 201 }));
    openTab("Create user");
    type("User identifier", "U-2");
    press("Create user");
    expect(await panel().findByRole("alert")).toHaveTextContent("Enter an organisation identifier");
    expect(calls).toHaveLength(0);
  });

  it("does not create a user without an identifier", async () => {
    const { calls } = renderPage(() => answer(USER, { status: 201 }));
    openTab("Create user");
    type("Organisation identifier", "ORG-1");
    press("Create user");
    expect(await panel().findByRole("alert")).toHaveTextContent("Enter a user identifier");
    expect(calls).toHaveLength(0);
  });

  it("shares the organisation between the tabs, and keeps users of other organisations apart", async () => {
    const { calls } = renderPage(() => answer(USER));
    openTab("User info");
    type("Organisation identifier", "ORG-1");
    type("User identifier", "U-1");
    press("Get info");
    await waitFor(() => expect(calls).toHaveLength(1));
    openTab("Create user");
    expect(panel().getByLabelText("Organisation identifier")).toHaveValue("ORG-1");
    expect(panel().getByLabelText("User identifier")).toHaveValue("U-1");
    openTab("User info");
    type("Organisation identifier", "ORG-2");
    press("Get info");
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.map((call) => call.path)).toEqual(["/organisations/ORG-1/users/U-1", "/organisations/ORG-2/users/U-1"]);
  });

  it("shows the users of the organisation, and the form of the one that is chosen, to send only what changed", async () => {
    const changed = { ...USER, description: "Operator", status: { "@type": "userStatus", label: "suspended" } };
    const { calls } = renderPage((request) =>
      request.method === "PATCH" ? answer(changed) : request.path === "/organisations/ORG-1" ? answer(ORGANISATION) : answer(USER),
    );
    openTab("Change user");
    type("Organisation identifier", "ORG-1");
    expect(panel().getByText("Show the users of an organisation to pick one")).toBeInTheDocument();
    expect(panel().queryByLabelText("User identifier")).toBeNull();
    press("Show the users");

    const table = await panel().findByRole("table", { name: "Users of ORG-1" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("U-1");
    expect(rows[0]).toHaveTextContent("admin");
    expect(calls.map((call) => call.path)).toEqual(["/organisations/ORG-1"]);
    expect(panel().queryByLabelText("Name of the user")).toBeNull();

    press("Edit U-1");
    await waitFor(() => expect(panel().getByLabelText("Name of the user")).toHaveValue("Jane Doe"));
    expect(calls.at(-1)).toMatchObject({ method: "GET", path: "/organisations/ORG-1/users/U-1" });
    expect(panel().getByLabelText("Description")).toHaveValue("Administrator");

    const save = panel().getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    type("Description", "Operator");
    type("Status", "suspended");
    await waitFor(() => expect(save).toBeEnabled());
    const summary = panel().getByRole("region", { name: "Changes to send" });
    expect(summary).toHaveTextContent("Change the description");
    expect(summary).toHaveTextContent("Set the status to suspended");

    fireEvent.click(save);
    await waitFor(() => expect(panel().getByText("Changed U-1 in ORG-1")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({
      method: "PATCH",
      path: "/organisations/ORG-1/users/U-1",
      body: [
        { op: "replace", path: "/description", value: "Operator" },
        { op: "replace", path: "/status", value: { "@type": "userStatus", label: "suspended" } },
      ],
    });
  });

  it("also lists a user created in this session that the organisation does not list yet, and says when there are none", async () => {
    renderPage((request) => (request.method === "POST" ? answer({ ...USER, id: "U-7" }, { status: 201 }) : answer(ORGANISATION)));
    openTab("Create user");
    type("Organisation identifier", "ORG-1");
    type("User identifier", "U-7");
    press("Create user");
    await waitFor(() => expect(panel().getByText("Created U-7 in ORG-1")).toBeInTheDocument());

    openTab("Change user");
    expect(panel().getByLabelText("Organisation identifier")).toHaveValue("ORG-1");
    expect(within(await panel().findByRole("table", { name: "Users of ORG-1" })).getAllByRole("row")).toHaveLength(2);
    press("Show the users");
    await waitFor(() => expect(within(panel().getByRole("table", { name: "Users of ORG-1" })).getAllByRole("row")).toHaveLength(3));
    expect(panel().getByRole("table", { name: "Users of ORG-1" })).toHaveTextContent("U-7");
    expect(panel().getByRole("table", { name: "Users of ORG-1" })).toHaveTextContent("U-1");
  });

  it("has no users to choose from when the organisation lists none", async () => {
    renderPage(() => answer({ ...ORGANISATION, users: [] }));
    openTab("Change user");
    type("Organisation identifier", "ORG-1");
    press("Show the users");
    expect(await panel().findByText("No users known")).toBeInTheDocument();
    expect(panel().queryByRole("table")).toBeNull();
  });

  it("forgets the chosen user when another organisation is entered", async () => {
    renderPage((request) => (request.path === "/organisations/ORG-1" ? answer(ORGANISATION) : answer(USER)));
    openTab("Change user");
    type("Organisation identifier", "ORG-1");
    press("Show the users");
    await panel().findByRole("table", { name: "Users of ORG-1" });
    press("Edit U-1");
    await waitFor(() => expect(panel().getByLabelText("Name of the user")).toBeInTheDocument());
    type("Organisation identifier", "ORG-2");
    expect(panel().queryByLabelText("Name of the user")).toBeNull();
  });
});

const deleted = () => new Response(null, { status: 200, headers: { "RPP-Code": "01000", "RPP-Svtrid": "S-8" } });
const withUsers = (...ids: string[]) => ({ ...ORGANISATION, users: ids.map((id) => ({ label: "admin", object: { "@type": "user", id } })) });

function confirm(group: string, button: string, typed: string) {
  const box = panel().getByRole("group", { name: group });
  const action = within(box).getByRole("button", { name: button });
  expect(action).toBeDisabled();
  fireEvent.change(within(box).getByLabelText(/Type/), { target: { value: typed } });
  fireEvent.click(action);
}

describe("organisation delete", () => {
  const answering = (organisation: unknown): Responder => (request) => (request.method === "DELETE" ? deleted() : answer(organisation));
  const checked = async (responder: Responder) => {
    const rendered = renderPage(responder);
    openTab("Delete");
    type("Organisation identifier", "ORG-1");
    press("Check the organisation");
    await panel().findByRole("region", { name: "Before deleting" });
    return rendered;
  };

  it("checks the organisation, and deletes it after its name is typed when no user is linked", async () => {
    const { calls } = await checked(answering(withUsers()));
    expect(panel().getByText("No users are linked to this organisation")).toBeInTheDocument();
    expect(panel().queryByRole("checkbox", { name: /Delete all organisation users/ })).toBeNull();

    press("Delete this organisation");
    confirm("Delete ORG-1?", "Delete ORG-1", "ORG-1");
    await waitFor(() => expect(panel().getByText("Deleted ORG-1")).toBeInTheDocument());
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(["GET /organisations/ORG-1", "GET /organisations/ORG-1", "DELETE /organisations/ORG-1"]);
    expect(panel().queryByRole("region", { name: "Before deleting" })).toBeNull();
  });

  it("does not offer to delete an organisation that still has users, and warns", async () => {
    const { calls } = await checked(answering(withUsers("U-1", "U-2")));
    expect(panel().getByText("This organisation still has 2 users")).toBeInTheDocument();
    expect(panel().getByRole("region", { name: "Before deleting" })).toHaveTextContent("U-2");
    expect(panel().getByRole("button", { name: "Delete this organisation" })).toBeDisabled();
    expect(panel().getByRole("checkbox", { name: /Delete all organisation users/ })).not.toBeChecked();
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("deletes the users first, with a warning, when that is asked for", async () => {
    const { calls } = await checked(answering(withUsers("U-1", "U-2")));
    fireEvent.click(panel().getByRole("checkbox", { name: /Delete all organisation users/ }));
    expect(panel().getByText("2 users will be deleted as well")).toBeInTheDocument();

    press("Delete this organisation");
    confirm("Delete ORG-1?", "Delete ORG-1", "ORG-1");
    await waitFor(() => expect(panel().getByText("Deleted ORG-1")).toBeInTheDocument());
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /organisations/ORG-1",
      "GET /organisations/ORG-1",
      "DELETE /organisations/ORG-1/users/U-1",
      "DELETE /organisations/ORG-1/users/U-2",
      "DELETE /organisations/ORG-1",
    ]);
    expect(panel().getByText(/Its users were deleted too/)).toHaveTextContent("U-1");
  });

  it("forgets the choice to delete the users when another organisation is entered", async () => {
    await checked(answering(withUsers("U-1")));
    fireEvent.click(panel().getByRole("checkbox", { name: /Delete all organisation users/ }));
    type("Organisation identifier", "ORG-2");
    type("Organisation identifier", "ORG-1");
    expect(panel().getByRole("checkbox", { name: /Delete all organisation users/ })).not.toBeChecked();
  });

  it("refuses to delete an organisation that gained a user since it was checked", async () => {
    let reads = 0;
    const { calls } = await checked((request) => (request.method === "DELETE" ? deleted() : answer(++reads === 1 ? withUsers() : withUsers("U-9"))));
    press("Delete this organisation");
    confirm("Delete ORG-1?", "Delete ORG-1", "ORG-1");
    expect(await panel().findByRole("alert")).toHaveTextContent("still has 1 user: U-9");
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("keeps the organisation, and says which users went, when one user cannot be deleted", async () => {
    const refused = new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "Forbidden", errors: [{ type: "t", result: "02201", reason: "Not allowed" }] }), {
      status: 403,
      headers: { "Content-Type": "application/problem+json", "RPP-Code": "02201" },
    });
    const { calls } = await checked((request) => {
      if (request.method !== "DELETE") return answer(withUsers("U-1", "U-2", "U-3"));
      return request.path.endsWith("/U-2") ? refused : deleted();
    });
    fireEvent.click(panel().getByRole("checkbox", { name: /Delete all organisation users/ }));
    press("Delete this organisation");
    confirm("Delete ORG-1?", "Delete ORG-1", "ORG-1");

    expect(await panel().findByRole("alert")).toHaveTextContent("Not allowed");
    expect(panel().getByText(/Users deleted so far/)).toHaveTextContent("U-1");
    expect(calls.some((call) => call.method === "DELETE" && call.path === "/organisations/ORG-1")).toBe(false);
    expect(calls.some((call) => call.path.endsWith("/U-3"))).toBe(false);
    // the organisation as shown no longer lists the user that was deleted
    expect(panel().getByRole("region", { name: "Before deleting" })).not.toHaveTextContent("U-1");
  });
});

describe("user delete", () => {
  it("deletes the chosen user only, after its identifier is typed, and drops it from the table", async () => {
    const { calls } = renderPage((request) => (request.method === "DELETE" ? deleted() : answer(withUsers("U-1", "U-2"))));
    openTab("Delete user");
    type("Organisation identifier", "ORG-1");
    press("Show the users");
    const table = await panel().findByRole("table", { name: "Users of ORG-1" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(panel().getByRole("button", { name: "Delete this user" })).toBeDisabled();

    press("Choose U-1");
    expect(panel().getByText("Deleting a user cannot be undone")).toBeInTheDocument();
    press("Delete this user");
    confirm("Delete U-1 from ORG-1?", "Delete U-1", "U-1");
    await waitFor(() => expect(panel().getByText("Deleted U-1 from ORG-1")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: "/organisations/ORG-1/users/U-1" });
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1);

    const after = panel().getByRole("table", { name: "Users of ORG-1" });
    expect(within(after).getAllByRole("row")).toHaveLength(2);
    expect(after).not.toHaveTextContent("U-1");
    expect(after).toHaveTextContent("U-2");
    expect(panel().getByRole("button", { name: "Delete this user" })).toBeDisabled();
  });

  it("does not delete without the identifier typed", async () => {
    const { calls } = renderPage((request) => (request.method === "DELETE" ? deleted() : answer(withUsers("U-1"))));
    openTab("Delete user");
    type("Organisation identifier", "ORG-1");
    press("Show the users");
    await panel().findByRole("table", { name: "Users of ORG-1" });
    press("Choose U-1");
    press("Delete this user");
    expect(within(panel().getByRole("group", { name: "Delete U-1 from ORG-1?" })).getByRole("button", { name: "Delete U-1" })).toBeDisabled();
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });
});
