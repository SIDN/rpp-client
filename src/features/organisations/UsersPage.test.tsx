// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConnectionProfile } from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { UsersPage } from "./UsersPage";
import { ORGANISATION, USER, type Responder, answer, deleted, discoveryWith, renderPage as render, USER_PROFILE, PROFILE, withUsers } from "./testSupport";

const renderPage = (responder: Responder, discovery?: DiscoveryState, profile: ConnectionProfile = USER_PROFILE, synthesize = false) =>
  render(<UsersPage />, responder, discovery, "/", profile, synthesize);

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const table = () => screen.findByRole("table", { name: /^Users of / });
const rows = (of: HTMLElement) => within(of).getAllByRole<HTMLTableRowElement>("row").slice(1);
const panel = () => within(screen.getByRole("region", { name: /^(User |Change |Delete |Add a user)/ }));

/** The organisation lists U-1 and U-2; each user answers as itself. */
const server: Responder = (request) => {
  if (request.path === "/organisations/ORG-1") return answer(withUsers("U-1", "U-2"));
  const id = request.path.split("/").at(-1) ?? "";
  return answer({ ...USER, id });
};

function typeToConfirm(id: string) {
  const box = screen.getByRole("group", { name: `Delete ${id} from ORG-1?` });
  const action = within(box).getByRole("button", { name: `Delete ${id}` });
  expect(action).toBeDisabled();
  fireEvent.change(within(box).getByLabelText(/Type/), { target: { value: id } });
  fireEvent.click(action);
}

describe("users screen", () => {
  it("waits for a connection", () => {
    renderPage(() => answer({}), { status: "not-started" });
    expect(screen.getByText("Connect to a server first")).toBeInTheDocument();
  });

  it("says so when the server has no users, even when it has organisations", () => {
    renderPage(() => answer({}), discoveryWith(["organisation"]));
    expect(screen.getByRole("status")).toHaveTextContent("This server does not offer users");
  });

  it("sends to the Connection screen when the connection has no organisation", () => {
    const { calls } = renderPage(() => answer({}), undefined, PROFILE);
    expect(screen.getByText("No organisation known for this connection")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Connection" })).toHaveAttribute("href", "/connection");
    expect(screen.queryByRole("table")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("asks for the organisation again when the profile was saved before it was asked for", () => {
    renderPage(() => answer({}), undefined, { ...USER_PROFILE, auth: { type: "basic", username: "jane", organisation: "" } });
    expect(screen.getByText("No organisation known for this connection")).toBeInTheDocument();
  });

  it("has no tabs and no field for the organisation", async () => {
    renderPage(server);
    await table();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByLabelText("Organisation identifier")).toBeNull();
    expect(screen.getByTestId("users-organisation")).toHaveTextContent("Users of organisation ORG-1, the organisation of jane.");
  });
});

describe("users on the server", () => {
  it("lists the users of the organisation at once, each with its own Edit and Delete", async () => {
    const { calls } = renderPage(server);
    const list = await table();
    expect(calls).toEqual([expect.objectContaining({ method: "GET", path: "/organisations/ORG-1" })]);
    expect(rows(list).map((row) => row.cells[0]?.textContent)).toEqual(["U-1", "U-2"]);
    expect(rows(list)[0]).toHaveTextContent("Not read yet");
    expect(rows(list)[0]).toHaveTextContent("admin");
    for (const id of ["U-1", "U-2"]) {
      expect(screen.getByRole("button", { name: `Edit ${id}` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Delete ${id}` })).toBeInTheDocument();
    }
  });

  it("shows a user when its identifier is chosen, and fills in its row", async () => {
    const { calls } = renderPage(server);
    await table();
    click("U-1");
    await waitFor(() => expect(panel().getByText("Loaded U-1")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({ method: "GET", path: "/organisations/ORG-1/users/U-1" });
    const dd = (term: string) => panel().getByText(term, { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(dd("Name")).toHaveTextContent("Jane Doe");
    expect(dd("Description")).toHaveTextContent("Administrator");
    const row = rows(await table())[0]!;
    expect(row).toHaveAttribute("aria-current", "true");
    expect(row).toHaveTextContent("Jane Doe");
    expect(row).toHaveTextContent("active");
  });

  it("edits a user from its row, sending only what changed", async () => {
    const { calls } = renderPage((request) => (request.method === "PATCH" ? answer({ ...USER, description: "Operator" }) : server(request)));
    await table();
    click("Edit U-1");
    await waitFor(() => expect(screen.getByLabelText("Name of the user")).toHaveValue("Jane Doe"));
    expect(calls.at(-1)).toMatchObject({ method: "GET", path: "/organisations/ORG-1/users/U-1" });
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    fill("Description", "Operator");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(screen.getByText("Changed U-1 in ORG-1")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", path: "/organisations/ORG-1/users/U-1", body: [{ op: "replace", path: "/description", value: "Operator" }] });
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(rows(await table())[0]).toHaveTextContent("Jane Doe");
  });

  it("deletes a user from its row only after its identifier is typed, and drops it from the table", async () => {
    const { calls } = renderPage((request) => (request.method === "DELETE" ? deleted() : server(request)));
    await table();
    click("Delete U-2");
    expect(screen.getByText("Deleting a user cannot be undone")).toBeInTheDocument();
    typeToConfirm("U-2");
    await waitFor(() => expect(screen.getByText("Deleted U-2 from ORG-1")).toBeInTheDocument());
    expect(calls.filter((call) => call.method === "DELETE")).toEqual([expect.objectContaining({ path: "/organisations/ORG-1/users/U-2" })]);
    expect(rows(await table()).map((row) => row.cells[0]?.textContent)).toEqual(["U-1"]);
  });

  it("closes the delete question on Cancel without sending anything", async () => {
    const { calls } = renderPage(server);
    await table();
    click("Delete U-1");
    click("Do not do it");
    expect(screen.queryByRole("group", { name: "Delete U-1 from ORG-1?" })).toBeNull();
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("adds a user to the organisation of the logged-in user and lists it", async () => {
    const { calls } = renderPage((request) => (request.method === "POST" ? answer({ ...USER, id: "U-7" }, { status: 201 }) : server(request)));
    await table();
    click("Add user");
    expect(screen.getByText(/only has to be unique within this organisation/)).toBeInTheDocument();
    fill("User identifier", "U-7");
    fill("Name of the user", "John");
    fill("Status", "suspended");
    click("Create user");

    await waitFor(() => expect(screen.getByText("Created U-7 in ORG-1")).toBeInTheDocument());
    expect(calls.at(-1)).toMatchObject({
      method: "POST",
      path: "/organisations/ORG-1/users",
      body: { "@type": "user", id: "U-7", details: { name: { full: "John" } }, status: { label: "suspended" } },
    });
    expect(rows(await table()).map((row) => row.cells[0]?.textContent)).toContain("U-7");
  });

  it("does not add a user without an identifier, or with one that is listed already", async () => {
    const { calls } = renderPage(server);
    await table();
    click("Add user");
    click("Create user");
    expect(await screen.findByText("Enter a user identifier")).toBeInTheDocument();
    fill("User identifier", "U-1");
    click("Create user");
    expect(await screen.findByText("This organisation already has a user U-1.")).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("says so when the organisation has no users", async () => {
    renderPage(() => answer({ ...ORGANISATION, users: [] }));
    expect(await screen.findByText("No users")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("synthesized users", () => {
  it("makes up users without a connection, and sends nothing", async () => {
    const { calls } = renderPage(() => answer({}), { status: "not-started" }, USER_PROFILE, true);
    expect(screen.getByText("Synthesized data")).toBeInTheDocument();
    expect(screen.getByTestId("users-organisation")).toHaveTextContent("ORG-1");
    const list = await table();
    expect(rows(list).length).toBeGreaterThan(3);
    for (const row of rows(list)) expect(row.cells[0]?.textContent).toMatch(/^user-\d+$/);
    expect(calls).toHaveLength(0);
  });

  it("uses an example organisation when no profile names one", async () => {
    renderPage(() => answer({}), { status: "not-started" }, PROFILE, true);
    expect(screen.getByTestId("users-organisation")).toHaveTextContent("Users of organisation ORG-EXAMPLE.");
    expect(await table()).toBeInTheDocument();
  });

  it("shows, edits, adds and deletes in the list only", async () => {
    const { calls } = renderPage(() => answer({}), undefined, USER_PROFILE, true);
    const first = rows(await table())[0]!;
    const id = first.cells[0]!.textContent!;

    click(id);
    expect(panel().getByText("Anna de Vries", { selector: "dd" })).toBeInTheDocument();

    click(`Edit ${id}`);
    fill("Name of the user", "Anna Smit");
    click("Save changes");
    expect(await screen.findByText(`Changed ${id} in this list`)).toBeInTheDocument();
    expect(rows(await table())[0]).toHaveTextContent("Anna Smit");

    click("Add user");
    fill("User identifier", "user-new");
    fill("Name of the user", "Nina");
    click("Create user");
    await waitFor(() => expect(screen.getByText("Added user-new to this list")).toBeInTheDocument());
    expect(rows(await table()).at(-1)).toHaveTextContent("Nina");

    click(`Delete ${id}`);
    typeToConfirm(id);
    expect(screen.getByText(`Deleted ${id} from this list`)).toBeInTheDocument();
    expect(rows(await table()).map((row) => row.cells[0]?.textContent)).not.toContain(id);
    expect(calls).toHaveLength(0);
  });
});
