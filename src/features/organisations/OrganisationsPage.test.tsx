// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConnectionProfile } from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { OrganisationsPage } from "./OrganisationsPage";
import { ORGANISATION, PROFILE, USER_PROFILE, type Call, type Responder, answer, deleted, discoveryWith, renderPage as render } from "./testSupport";

const renderPage = (responder: Responder, options: { discovery?: DiscoveryState; entry?: string; profile?: ConnectionProfile; synthesize?: boolean } = {}) =>
  render(<OrganisationsPage />, responder, options.discovery, options.entry ?? "/organisations", options.profile ?? USER_PROFILE, options.synthesize ?? false);

/** Two children of ORG-1, the organisation of the logged-in user. */
const child = (id: string, users: string[] = []) => ({
  ...ORGANISATION,
  id,
  roles: { reseller: { "@type": "organisationRole" } },
  parent: { "@type": "organisation", id: "ORG-1" },
  contactInfo: { "@type": "Card", version: "2.0", name: { full: `Reseller ${id}` } },
  users: users.map((user) => ({ label: "admin", object: { "@type": "user", id: user } })),
});

const serverWith = (byId: (id: string) => unknown = (id) => child(id), results: unknown[] = [child("ORG-2"), child("ORG-3")], nextCursor?: string): Responder => (request) => {
  if (request.method === "QUERY") return answer({ results, ...(nextCursor && { nextCursor }) });
  if (request.method === "DELETE") return deleted();
  return answer(byId(request.path.split("/")[2] ?? ""));
};

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const table = () => screen.findByRole("table", { name: /^Child organisations of / });
const rows = (of: HTMLElement) => within(of).getAllByRole<HTMLTableRowElement>("row").slice(1);
const ids = (of: HTMLElement) => rows(of).map((row) => row.cells[0]?.textContent);
const panel = () => within(screen.getByRole("region", { name: /^(Organisation |Change |Delete |Add an organisation)/ }));
const sent = (calls: Call[]) => calls.map((call) => `${call.method} ${call.path}`);

function typeToConfirm(id: string) {
  const box = screen.getByRole("group", { name: `Delete ${id}?` });
  const action = within(box).getByRole("button", { name: `Delete ${id}` });
  expect(action).toBeDisabled();
  fireEvent.change(within(box).getByLabelText(/Type/), { target: { value: id } });
  fireEvent.click(action);
}

describe("organisations screen", () => {
  it("waits for a connection", () => {
    renderPage(() => answer({}), { discovery: { status: "not-started" } });
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("says so when the server has no organisations", () => {
    renderPage(() => answer({}), { discovery: discoveryWith(["domainName"]) });
    expect(screen.getByRole("status")).toHaveTextContent("This server does not offer organisations");
  });

  it("sends to the Connection screen when the connection names no organisation", () => {
    const { calls } = renderPage(() => answer({}), { profile: PROFILE });
    expect(screen.getByText("No organisation known for this connection")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Connection" })).toHaveAttribute("href", "/connection");
    expect(calls).toHaveLength(0);
  });

  it("has no tabs, and says whose children are listed", async () => {
    renderPage(serverWith());
    await table();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByTestId("organisations-parent")).toHaveTextContent("Child organisations of ORG-1, the organisation of jane.");
  });
});

describe("child organisations on the server", () => {
  it("asks for the children of the organisation at once and lists them, each with its own Edit and Delete", async () => {
    const { calls } = renderPage(serverWith());
    const list = await table();
    expect(calls).toEqual([
      expect.objectContaining({
        method: "QUERY",
        path: "/organisations",
        body: { filter: { element: "parent.id", op: "eq", value: "ORG-1" }, sort: [{ element: "id", direction: "asc" }], limit: 50 },
      }),
    ]);
    expect(ids(list)).toEqual(["ORG-2", "ORG-3"]);
    expect(rows(list)[0]).toHaveTextContent("Reseller ORG-2");
    expect(rows(list)[0]).toHaveTextContent("ok");
    expect(rows(list)[0]).toHaveTextContent("reseller");
    for (const id of ["ORG-2", "ORG-3"]) {
      expect(screen.getByRole("button", { name: `Edit ${id}` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Delete ${id}` })).toBeInTheDocument();
    }
  });

  it("says when the server has more children than the first page", async () => {
    renderPage(serverWith(undefined, [child("ORG-2")], "next-page"));
    await table();
    expect(screen.getByText("There are more child organisations")).toBeInTheDocument();
  });

  it("says so when there are no children", async () => {
    renderPage(serverWith(undefined, []));
    expect(await screen.findByText("No child organisations")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("explains a list the server refuses with its own reason", async () => {
    renderPage(() =>
      new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "Not Implemented", errors: [{ type: "t", result: "02101", reason: "No query here" }] }), {
        status: 501,
        headers: { "Content-Type": "application/problem+json", "RPP-Code": "02101" },
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("No query here");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("reads an organisation when its identifier is chosen, and shows what this client does not model", async () => {
    const { calls } = renderPage(serverWith());
    await table();
    click("ORG-2");
    await waitFor(() => expect(panel().getByText("Found ORG-2")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({ method: "GET", path: "/organisations/ORG-2" });
    const dd = (term: string) => panel().getByText(term, { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(dd("Roles")).toHaveTextContent("reseller");
    expect(dd("Parent")).toHaveTextContent("ORG-1");
    expect(dd("Contacts")).toHaveTextContent("C-1");
    expect(panel().getByText("weird")).toBeInTheDocument();
    expect(screen.getByRole("row", { current: true })).toHaveTextContent("ORG-2");
  });

  it("shows the organisation a link from Search names at once", async () => {
    const { calls } = renderPage(serverWith(), { entry: "/organisations?name=ORG-9&tab=info&run=1" });
    await waitFor(() => expect(panel().getByText("Found ORG-9")).toBeInTheDocument());
    expect(sent(calls)).toEqual(expect.arrayContaining(["QUERY /organisations", "GET /organisations/ORG-9"]));
  });

  it("edits an organisation from its row, showing and sending only what changed", async () => {
    const { calls } = renderPage((request) =>
      request.method === "PATCH" ? answer({ ...child("ORG-2"), parent: { "@type": "organisation", id: "ORG-5" } }) : serverWith()(request),
    );
    await table();
    click("Edit ORG-2");
    await waitFor(() => expect(screen.getByLabelText("Role 1")).toHaveValue("reseller"));
    expect(calls.at(-1)).toMatchObject({ method: "GET", path: "/organisations/ORG-2" });
    expect(screen.getByLabelText("Parent organisation")).toHaveValue("ORG-1");

    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    fill("Parent organisation", "ORG-5");
    click("Add a role");
    fill("Role 2", "dns-operator");
    const summary = screen.getByRole("region", { name: "Changes to send" });
    await waitFor(() => expect(summary).toHaveTextContent("Set the parent organisation to ORG-5"));
    expect(summary).toHaveTextContent("Add the role dns-operator");

    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText("Changed ORG-2")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({
      method: "PATCH",
      path: "/organisations/ORG-2",
      body: [
        { op: "add", path: "/roles/dns-operator", value: { "@type": "organisationRole" } },
        { op: "replace", path: "/parent/id", value: "ORG-5" },
      ],
    });
  });

  it("says what is wrong while the edit is not complete, and does not offer to save", async () => {
    renderPage(serverWith());
    await table();
    click("Edit ORG-2");
    await waitFor(() => expect(screen.getByLabelText("Role 1")).toHaveValue("reseller"));
    fill("Role 1", "");
    await waitFor(() => expect(screen.getByRole("region", { name: "Changes to send" })).toHaveTextContent("An organisation needs at least one role"));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("adds an organisation under the organisation of the logged-in user and lists it", async () => {
    const { calls } = renderPage((request) => (request.method === "POST" ? answer(child("ORG-4"), { status: 201 }) : serverWith()(request)));
    await table();
    click("Add organisation");
    expect(screen.getByLabelText("Parent organisation")).toHaveValue("ORG-1");
    fill("Organisation identifier", "ORG-4");
    fill("Role 1", "reseller");
    fill("Name", "Reseller ORG-4");
    click("Create organisation");

    await waitFor(() => expect(panel().getByText("Created ORG-4")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({
      method: "POST",
      path: "/organisations",
      body: {
        "@type": "organisation",
        id: "ORG-4",
        roles: { reseller: { "@type": "organisationRole" } },
        parent: { "@type": "organisation", id: "ORG-1" },
        contactInfo: { "@type": "Card", name: { full: "Reseller ORG-4" } },
      },
    });
    expect(ids(await table())).toEqual(["ORG-2", "ORG-3", "ORG-4"]);
  });

  it("flags what is missing or listed already before sending a new organisation", async () => {
    const { calls } = renderPage(serverWith());
    await table();
    click("Add organisation");
    click("Create organisation");
    expect(await screen.findByText("Enter an organisation identifier")).toBeInTheDocument();
    expect(screen.getByText("Give the role a type")).toBeInTheDocument();
    fill("Organisation identifier", "ORG-2");
    click("Create organisation");
    expect(await screen.findByText("An organisation ORG-2 is already in this list.")).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("deletes an organisation without users after its identifier is typed, and drops it from the table", async () => {
    const { calls } = renderPage(serverWith());
    await table();
    click("Delete ORG-2");
    expect(await screen.findByText("No users are linked to this organisation")).toBeInTheDocument();
    typeToConfirm("ORG-2");
    await waitFor(() => expect(screen.getByText("Deleted ORG-2")).toBeInTheDocument());
    expect(sent(calls)).toEqual(["QUERY /organisations", "GET /organisations/ORG-2", "GET /organisations/ORG-2", "DELETE /organisations/ORG-2"]);
    expect(ids(await table())).toEqual(["ORG-3"]);
  });

  it("only offers to delete an organisation with users together with them, and deletes the users first", async () => {
    const { calls } = renderPage(serverWith((id) => child(id, ["U-1", "U-2"])));
    await table();
    click("Delete ORG-2");
    expect(await screen.findByText("This organisation still has 2 users")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Delete ORG-2?" })).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: /Delete all organisation users/ }));
    expect(screen.getByText("2 users will be deleted as well")).toBeInTheDocument();
    typeToConfirm("ORG-2");
    await waitFor(() => expect(screen.getByText("Deleted ORG-2")).toBeInTheDocument());
    expect(sent(calls).slice(-3)).toEqual(["DELETE /organisations/ORG-2/users/U-1", "DELETE /organisations/ORG-2/users/U-2", "DELETE /organisations/ORG-2"]);
    expect(screen.getByText(/Its users were deleted too/)).toHaveTextContent("U-2");
  });

  it("refuses to delete an organisation that gained a user since it was read", async () => {
    let reads = 0;
    const { calls } = renderPage(serverWith((id) => child(id, ++reads === 1 ? [] : ["U-9"])));
    await table();
    click("Delete ORG-2");
    await screen.findByText("No users are linked to this organisation");
    typeToConfirm("ORG-2");
    expect(await panel().findByRole("alert")).toHaveTextContent("still has 1 user: U-9");
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("keeps the organisation, and says which users went, when one user cannot be deleted", async () => {
    const refused = new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "Forbidden", errors: [{ type: "t", result: "02201", reason: "Not allowed" }] }), {
      status: 403,
      headers: { "Content-Type": "application/problem+json", "RPP-Code": "02201" },
    });
    const server = serverWith((id) => child(id, ["U-1", "U-2", "U-3"]));
    const { calls } = renderPage((request) => (request.method === "DELETE" && request.path.endsWith("/U-2") ? refused : server(request)));
    await table();
    click("Delete ORG-2");
    fireEvent.click(await screen.findByRole("checkbox", { name: /Delete all organisation users/ }));
    typeToConfirm("ORG-2");

    expect(await panel().findByRole("alert")).toHaveTextContent("Not allowed");
    expect(panel().getByText(/Users deleted so far/)).toHaveTextContent("U-1");
    expect(calls.some((call) => call.method === "DELETE" && call.path === "/organisations/ORG-2")).toBe(false);
    expect(calls.some((call) => call.path.endsWith("/U-3"))).toBe(false);
    expect(panel().getByRole("region", { name: "Before deleting" })).not.toHaveTextContent("U-1");
  });
});

describe("synthesized child organisations", () => {
  it("makes up children of the user's organisation without a connection, naming no registrar, and sends nothing", async () => {
    const { calls } = renderPage(() => answer({}), { discovery: { status: "not-started" }, synthesize: true });
    expect(screen.getByText("Synthesized data")).toBeInTheDocument();
    expect(screen.getByTestId("organisations-parent")).toHaveTextContent("ORG-1");
    const list = await table();
    expect(rows(list).length).toBeGreaterThan(3);
    for (const row of rows(list)) {
      expect(row.cells[0]?.textContent).toMatch(/^org-\d+$/);
      expect(row.cells[3]?.textContent).not.toContain("registrar");
    }
    click(rows(list)[0]!.cells[0]!.textContent!);
    expect(panel().getByText("ORG-1", { selector: "dd *, dd" })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("uses an example organisation when no profile names one", async () => {
    renderPage(() => answer({}), { discovery: { status: "not-started" }, profile: PROFILE, synthesize: true });
    expect(screen.getByTestId("organisations-parent")).toHaveTextContent("Child organisations of ORG-EXAMPLE.");
    expect(await table()).toBeInTheDocument();
  });

  it("edits, adds and deletes in the list only", async () => {
    const { calls } = renderPage(() => answer({}), { synthesize: true });
    const first = rows(await table())[0]!;
    const id = first.cells[0]!.textContent!;

    click(`Edit ${id}`);
    fill("Name", "Noordzee Domeinen");
    click("Save changes");
    expect(await screen.findByText(`Changed ${id} in this list`)).toBeInTheDocument();
    expect(rows(await table())[0]).toHaveTextContent("Noordzee Domeinen");

    click("Add organisation");
    fill("Organisation identifier", "org-new");
    fill("Role 1", "reseller");
    click("Create organisation");
    await waitFor(() => expect(screen.getByText("Added org-new to this list")).toBeInTheDocument());
    expect(ids(await table()).at(-1)).toBe("org-new");

    // The first made-up organisation lists users, so it is only deleted together with them.
    click(`Delete ${id}`);
    fireEvent.click(screen.getByRole("checkbox", { name: /Delete all organisation users/ }));
    typeToConfirm(id);
    expect(screen.getByText(`Deleted ${id} from this list`)).toBeInTheDocument();
    expect(ids(await table())).not.toContain(id);
    expect(calls).toHaveLength(0);
  });
});
