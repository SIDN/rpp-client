import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "@/rpp/client/FetchTransport";
import { RppError } from "@/rpp/errors/RppError";
import { createRppClient } from "@/rpp/operations/RppClient";
import { EMPTY_CONTACT } from "./contactCard";
import { createBody, createContactWorkflows, parseContactId } from "./contactWorkflows";

const BASE = "https://rpp.example.test/rpp";
const CONTACT = { "@type": "contact", id: "C-1", provMetadata: { "@type": "provMetadata", spClientId: "X" }, status: [], contactInfo: { "@type": "Card" } };

function setup(body: unknown = CONTACT, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(
    async (_input, init) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/rpp+json" }), "RPP-Cltrid": new Headers(init?.headers).get("RPP-Cltrid") ?? "", "RPP-Code": "01000" },
      }),
  );
  const workflows = createContactWorkflows(createRppClient({ transport: createFetchTransport({ baseUrl: BASE, fetch: fetchMock }) }));
  const last = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
    return {
      method: init?.method,
      path: `${(url as URL).pathname}${(url as URL).search}`,
      headers: new Headers(init?.headers),
      body: init?.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown),
    };
  };
  return { workflows, last, fetchMock };
}

describe("contact identifier", () => {
  it("loses its surrounding whitespace and is otherwise left alone", () => {
    expect(parseContactId("  Fo-123 ")).toBe("Fo-123");
    expect(() => parseContactId("  ")).toThrow(RppError);
  });

  it("is refused before anything is sent when empty", async () => {
    const { workflows, fetchMock } = setup();
    await expect(workflows.info("")).rejects.toBeInstanceOf(RppError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("check, lookup and create", () => {
  it("checks the identifier with GET", async () => {
    const { workflows, last } = setup({ "@type": "contactAvailability", available: true });
    expect((await workflows.check("C-1")).available).toBe(true);
    expect(last()).toMatchObject({ method: "GET", path: "/rpp/contacts/C-1/availability" });
  });

  it("encodes an identifier that would change the path", async () => {
    const { workflows, last } = setup();
    await workflows.info("a/b c");
    expect(last().path).toBe("/rpp/contacts/a%2Fb%20c");
  });

  it("looks up a contact, asking for the transfer password only when told to", async () => {
    const { workflows, last } = setup();
    await workflows.info("C-1");
    expect(last()).toMatchObject({ method: "GET", path: "/rpp/contacts/C-1" });
    await workflows.info("C-1", { authInfo: true });
    expect(last().path).toBe("/rpp/contacts/C-1?includeElements=authInfo");
  });

  it("creates with POST and what was filled in", async () => {
    const { workflows, last } = setup(CONTACT, 201);
    await workflows.create({ id: "C-1", data: { ...EMPTY_CONTACT, name: "John", email: "j@example.test" }, authInfo: "pw" });
    expect(last()).toMatchObject({
      method: "POST",
      path: "/rpp/contacts?includeElements=authInfo",
      body: {
        "@type": "contact",
        id: "C-1",
        contactInfo: { "@type": "Card", version: "2.0", name: { full: "John" }, emails: { email: { address: "j@example.test" } } },
        authInfo: { "@type": "authInfo", method: "authinfo", authdata: "pw" },
      },
    });
    expect(createBody({ id: "C-2", data: EMPTY_CONTACT })).toEqual({ "@type": "contact", id: "C-2", contactInfo: { "@type": "Card", version: "2.0" } });
  });
});

describe("change and delete", () => {
  it("patches with the operations given", async () => {
    const { workflows, last } = setup();
    await workflows.change("C-1", [{ op: "replace", path: "/contactInfo/name/full", value: "Jane" }]);
    expect(last()).toMatchObject({ method: "PATCH", path: "/rpp/contacts/C-1", body: [{ op: "replace", path: "/contactInfo/name/full", value: "Jane" }] });
  });

  it("deletes with DELETE and no body", async () => {
    const { workflows, last } = setup(undefined);
    await workflows.remove("C-1");
    expect(last()).toMatchObject({ method: "DELETE", path: "/rpp/contacts/C-1", body: undefined });
  });
});

describe("transfer", () => {
  it("requests with the password in RPP-Authorization and not in the body", async () => {
    const { workflows, last } = setup({ "@type": "transferProcess", trStatus: "pending" });
    await workflows.transfer.request("C-1", { authInfo: "My Secret" });
    const request = last();
    expect(request).toMatchObject({ method: "POST", path: "/rpp/contacts/C-1/processes/transferProcesses", body: { "@type": "transferProcess", transferDir: "pull" } });
    expect(request.headers.get("RPP-Authorization")).toBe(`authinfo value=${btoa("My Secret")}`);
    expect(JSON.stringify(request.body)).not.toContain("Secret");
  });

  it("pushes to a designated gaining client, with no password", async () => {
    const { workflows, last } = setup({ "@type": "transferProcess", trStatus: "pending", transferDir: "push" });
    await workflows.transfer.push("C-1", { gainingClientId: "other-registrar" });
    const request = last();
    expect(request).toMatchObject({ method: "POST", path: "/rpp/contacts/C-1/processes/transferProcesses" });
    expect(request.body).toEqual({ "@type": "transferProcess", transferDir: "push", gainingClientId: "other-registrar" });
    expect(request.headers.get("RPP-Authorization")).toBeNull();
  });

  it("reads, cancels, approves and rejects the latest transfer", async () => {
    const { workflows, last } = setup({ "@type": "transferProcess", trStatus: "pending" });
    const base = "/rpp/contacts/C-1/processes/transferProcesses/latest";
    await workflows.transfer.status("C-1");
    expect(last()).toMatchObject({ method: "GET", path: base });
    await workflows.transfer.cancel("C-1");
    expect(last()).toMatchObject({ method: "DELETE", path: base });
    await workflows.transfer.approve("C-1");
    expect(last()).toMatchObject({ method: "POST", path: `${base}/transferApprove` });
    await workflows.transfer.reject("C-1");
    expect(last()).toMatchObject({ method: "POST", path: `${base}/transferReject` });
  });
});
