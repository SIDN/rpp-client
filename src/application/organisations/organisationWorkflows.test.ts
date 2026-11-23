import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "@/rpp/client/FetchTransport";
import { RppError } from "@/rpp/errors/RppError";
import { createRppClient } from "@/rpp/operations/RppClient";
import { createOrganisationWorkflows } from "./organisationWorkflows";
import { EMPTY_ORGANISATION } from "./organisationData";
import { EMPTY_USER } from "./userData";

const BASE = "https://rpp.example.test/rpp";
const ORGANISATION = { "@type": "organisation", id: "ORG-1", provMetadata: { "@type": "provMetadata", spClientId: "X" }, status: [], roles: { registrar: { "@type": "organisationRole" } } };
const USER = { "@type": "user", id: "U-1", details: { "@type": "Card" }, status: { "@type": "userStatus", label: "active" }, organisation: { "@type": "organisation", id: "ORG-1" } };

function setup(body: unknown = ORGANISATION, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(
    async (_input, init) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/rpp+json", "RPP-Cltrid": new Headers(init?.headers).get("RPP-Cltrid") ?? "", "RPP-Code": "01000" },
      }),
  );
  const workflows = createOrganisationWorkflows(createRppClient({ transport: createFetchTransport({ baseUrl: BASE, fetch: fetchMock }) }));
  const last = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
    return { method: init?.method, path: (url as URL).pathname, body: init?.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown) };
  };
  return { workflows, last, fetchMock };
}

describe("organisation workflows", () => {
  it("reads an organisation with GET and trims the identifier", async () => {
    const { workflows, last } = setup();
    await workflows.info(" ORG-1 ");
    expect(last()).toMatchObject({ method: "GET", path: "/rpp/organisations/ORG-1" });
  });

  it("creates an organisation with POST", async () => {
    const { workflows, last } = setup(ORGANISATION, 201);
    await workflows.create({ id: "ORG-1", data: { ...EMPTY_ORGANISATION, roles: [{ name: "registrar", roleId: "", linkProhibited: false }] } });
    expect(last()).toMatchObject({
      method: "POST",
      path: "/rpp/organisations",
      body: { "@type": "organisation", id: "ORG-1", roles: { registrar: { "@type": "organisationRole" } } },
    });
  });

  it("updates an organisation with PATCH and the operations given", async () => {
    const { workflows, last } = setup();
    await workflows.change("ORG-1", [{ op: "add", path: "/parent", value: { "@type": "organisation", id: "ORG-0" } }]);
    expect(last()).toMatchObject({ method: "PATCH", path: "/rpp/organisations/ORG-1", body: [{ op: "add", path: "/parent", value: { "@type": "organisation", id: "ORG-0" } }] });
  });

  it("refuses an organisation without an identifier or a role before anything is sent", async () => {
    const { workflows, fetchMock } = setup();
    await expect(workflows.info("")).rejects.toBeInstanceOf(RppError);
    await expect(workflows.create({ id: "ORG-1", data: EMPTY_ORGANISATION })).rejects.toBeInstanceOf(RppError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("user workflows", () => {
  it("reads, creates and updates a user below its organisation", async () => {
    const { workflows, last } = setup(USER);
    await workflows.users.info("ORG-1", "U-1");
    expect(last()).toMatchObject({ method: "GET", path: "/rpp/organisations/ORG-1/users/U-1" });

    await workflows.users.create("ORG-1", { id: "U-2", data: EMPTY_USER });
    expect(last()).toMatchObject({ method: "POST", path: "/rpp/organisations/ORG-1/users", body: { "@type": "user", id: "U-2", details: { "@type": "Card", version: "2.0" } } });

    await workflows.users.change("ORG-1", "U-1", [{ op: "replace", path: "/description", value: "x" }]);
    expect(last()).toMatchObject({ method: "PATCH", path: "/rpp/organisations/ORG-1/users/U-1", body: [{ op: "replace", path: "/description", value: "x" }] });
  });

  it("addresses the same user identifier in two organisations separately", async () => {
    const { workflows, last } = setup(USER);
    await workflows.users.info("ORG-1", "U-1");
    const first = last().path;
    await workflows.users.info("ORG-2", "U-1");
    expect(last().path).not.toBe(first);
    expect(last().path).toBe("/rpp/organisations/ORG-2/users/U-1");
  });

  it("encodes an identifier that would change the path", async () => {
    const { workflows, last } = setup(USER);
    await workflows.users.info("ORG/1", "U 1");
    expect(last().path).toBe("/rpp/organisations/ORG%2F1/users/U%201");
  });

  it("refuses a user without an organisation, or without an identifier, before anything is sent", async () => {
    const { workflows, fetchMock } = setup(USER);
    await expect(workflows.users.create("", { id: "U-2", data: EMPTY_USER })).rejects.toBeInstanceOf(RppError);
    await expect(workflows.users.create("  ", { id: "U-2", data: EMPTY_USER })).rejects.toThrow("organisation identifier");
    await expect(workflows.users.create("ORG-1", { id: " ", data: EMPTY_USER })).rejects.toBeInstanceOf(RppError);
    await expect(workflows.users.info("ORG-1", "")).rejects.toBeInstanceOf(RppError);
    await expect(workflows.users.change("", "U-1", [{ op: "remove", path: "/description" }])).rejects.toBeInstanceOf(RppError);
    await expect(workflows.users.remove("ORG-1", " ")).rejects.toBeInstanceOf(RppError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes a user of an organisation with DELETE and no body", async () => {
    const { workflows, last } = setupDeletes();
    await workflows.users.remove("ORG-1", "U-1");
    expect(last()).toMatchObject({ method: "DELETE", path: "/rpp/organisations/ORG-1/users/U-1", body: undefined });
  });
});

const withUsers = (...ids: string[]) => ({ ...ORGANISATION, users: ids.map((id) => ({ label: "admin", object: { "@type": "user", id } })) });

/** Reads the organisation as `organisation`; every DELETE is answered with no content, except those of `failing` paths. */
function setupDeletes(organisation: unknown = ORGANISATION, failing: string[] = []) {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = input as URL;
    const method = init?.method ?? "GET";
    requests.push({ method, path: url.pathname, body: init?.body });
    if (failing.includes(url.pathname)) {
      return new Response(JSON.stringify({ type: "urn:ietf:params:rpp:error", title: "Forbidden", errors: [{ type: "t", result: "02201", reason: "Not allowed" }] }), {
        status: 403,
        headers: { "Content-Type": "application/problem+json", "RPP-Code": "02201" },
      });
    }
    if (method === "DELETE") return new Response(null, { status: 200, headers: { "RPP-Code": "01000" } });
    return new Response(JSON.stringify(organisation), { status: 200, headers: { "Content-Type": "application/rpp+json", "RPP-Code": "01000" } });
  });
  const workflows = createOrganisationWorkflows(createRppClient({ transport: createFetchTransport({ baseUrl: BASE, fetch: fetchMock }) }));
  return { workflows, requests, last: () => requests.at(-1), fetchMock };
}

describe("delete an organisation", () => {
  it("checks the organisation first, then deletes it when no user is linked", async () => {
    const { workflows, requests } = setupDeletes();
    const result = await workflows.remove(" ORG-1 ");
    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual(["GET /rpp/organisations/ORG-1", "DELETE /rpp/organisations/ORG-1"]);
    expect(result.data).toEqual({ deletedUsers: [] });
  });

  it("deletes nothing when users are still linked and deleting them was not asked for", async () => {
    const { workflows, requests } = setupDeletes(withUsers("U-1", "U-2"));
    await expect(workflows.remove("ORG-1")).rejects.toThrow("still has 2 users: U-1, U-2");
    expect(requests.map((request) => request.method)).toEqual(["GET"]);
    const single = setupDeletes(withUsers("U-1"));
    await expect(single.workflows.remove("ORG-1", { deleteUsers: false })).rejects.toThrow("still has 1 user: U-1");
  });

  it("deletes the users one at a time, and then the organisation, when asked to", async () => {
    const { workflows, requests } = setupDeletes(withUsers("U-1", "U-2"));
    const seen: string[] = [];
    const result = await workflows.remove("ORG-1", { deleteUsers: true, onUserDeleted: (id) => seen.push(id) });
    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "GET /rpp/organisations/ORG-1",
      "DELETE /rpp/organisations/ORG-1/users/U-1",
      "DELETE /rpp/organisations/ORG-1/users/U-2",
      "DELETE /rpp/organisations/ORG-1",
    ]);
    expect(seen).toEqual(["U-1", "U-2"]);
    expect(result.data).toEqual({ deletedUsers: ["U-1", "U-2"] });
  });

  it("leaves the organisation alone when a user cannot be deleted, and says which users were deleted", async () => {
    const { workflows, requests } = setupDeletes(withUsers("U-1", "U-2", "U-3"), ["/rpp/organisations/ORG-1/users/U-2"]);
    const seen: string[] = [];
    await expect(workflows.remove("ORG-1", { deleteUsers: true, onUserDeleted: (id) => seen.push(id) })).rejects.toBeInstanceOf(RppError);
    expect(seen).toEqual(["U-1"]);
    expect(requests.some((request) => request.method === "DELETE" && request.path === "/rpp/organisations/ORG-1")).toBe(false);
    expect(requests.some((request) => request.path.endsWith("/U-3"))).toBe(false);
  });

  it("is refused without an identifier before anything is sent", async () => {
    const { workflows, fetchMock } = setupDeletes();
    await expect(workflows.remove(" ")).rejects.toBeInstanceOf(RppError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
