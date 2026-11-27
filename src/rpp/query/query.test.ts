import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "../client/FetchTransport";
import { RppError } from "../errors/RppError";
import { createRppClient } from "../operations/RppClient";
import { validateQueryObject, type QueryObject } from "./queryObject";
import { operatorsOf, SEARCHABLE_ELEMENTS } from "./searchable";

const BASE = "https://rpp.example.test/rpp";

function setup(respond: (headers: Headers, init: RequestInit) => Response) {
  const fetchMock = vi.fn<typeof fetch>(async (_input, init) => respond(new Headers(init?.headers), init ?? {}));
  const client = createRppClient({ transport: createFetchTransport({ baseUrl: BASE, fetch: fetchMock }) });
  const call = () => {
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    return { url: url as URL, init: init as RequestInit, headers: new Headers(init?.headers), body: init?.body as string | undefined };
  };
  return { client, fetchMock, call };
}

function reply(headers: Headers, status: number, body?: unknown, type = "application/rpp+json") {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": type }),
      "RPP-Cltrid": headers.get("RPP-Cltrid") ?? "",
      "RPP-Svtrid": "S-1",
      "RPP-Code": status < 300 ? "01000" : "02101",
    },
  });
}

async function failure(promise: Promise<unknown>): Promise<RppError> {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(RppError);
  return error as RppError;
}

const domain = (name: string) => ({ "@type": "domainName", name, provMetadata: { "@type": "provMetadata", spClientId: "X" }, status: [] });

const QUERY: QueryObject = {
  filter: { and: [{ element: "name", op: "sw", value: "exa" }, { not: { element: "status.label", op: "in", value: ["serverHold"] } }] },
  sort: [{ element: "expiryDate", direction: "desc" }],
  limit: 10,
};

describe("validateQueryObject", () => {
  it("accepts the examples of the issue", () => {
    expect(validateQueryObject(QUERY)).toEqual({ status: "valid" });
    expect(validateQueryObject({ filter: { element: "linked", op: "pr" }, includeElements: ["linked"] })).toEqual({ status: "valid" });
    expect(validateQueryObject({})).toEqual({ status: "valid" });
  });

  it.each([
    ["a value with pr", { filter: { element: "name", op: "pr", value: "x" } }],
    ["no value with eq", { filter: { element: "name", op: "eq" } }],
    ["a scalar with in", { filter: { element: "name", op: "in", value: "x" } }],
    ["an empty in list", { filter: { element: "name", op: "in", value: [] } }],
    ["an array with eq", { filter: { element: "name", op: "eq", value: ["x"] } }],
    ["an unknown operator", { filter: { element: "name", op: "like", value: "x" } }],
    ["a group of one", { filter: { and: [{ element: "name", op: "pr" }] } }],
    ["a bad path", { filter: { element: "1name", op: "pr" } }],
    ["six sort keys", { sort: Array.from({ length: 6 }, () => ({ element: "name" })) }],
    ["a limit of zero", { limit: 0 }],
    ["an empty cursor", { cursor: "" }],
    ["duplicate includeElements", { includeElements: ["linked", "linked"] }],
    ["an unknown member", { page: 2 }],
  ])("rejects %s", (_name, query) => {
    expect(validateQueryObject(query).status).toBe("invalid");
  });
});

describe("searchable elements", () => {
  it("offers comparisons only on timestamps and integers, and prefix and substring only on strings", () => {
    expect(operatorsOf({ type: "timestamp" })).toEqual(["eq", "ne", "in", "pr", "lt", "le", "gt", "ge"]);
    expect(operatorsOf({ type: "boolean" })).toEqual(["eq", "ne", "in", "pr"]);
    expect(operatorsOf({ type: "string" })).toEqual(["eq", "ne", "in", "pr", "sw", "co"]);
  });

  it("never offers authInfo or disclose", () => {
    const paths = Object.values(SEARCHABLE_ELEMENTS).flatMap((elements) => elements.map((element) => element.path));
    expect(paths.some((path) => /authInfo|disclose/.test(path))).toBe(false);
  });
});

describe("query", () => {
  it("sends QUERY to the collection with the Query Object as JSON content", async () => {
    const { client, call } = setup((h) => reply(h, 200, { results: [domain("example.test")], nextCursor: "c2", total: 3 }));
    const result = await client.domains.query(QUERY);

    const { url, init, headers, body } = call();
    expect(init.method).toBe("QUERY");
    expect(url.toString()).toBe(`${BASE}/domainNames`);
    expect(headers.get("Content-Type")).toMatch(/json/);
    expect(JSON.parse(body ?? "")).toEqual(QUERY);
    expect(result.data).toEqual({ results: [domain("example.test")], nextCursor: "c2", total: 3 });
    expect(result.meta.validation.request).toEqual({ status: "valid" });
    expect(result.meta.warnings).toEqual([]);
  });

  it("searches the collection of each object type", async () => {
    const { client, call } = setup((h) => reply(h, 200, { results: [] }));
    await client.hosts.query({});
    expect(call().url.toString()).toBe(`${BASE}/hosts`);
  });

  it("keeps results of another type and reports them", async () => {
    const host = { "@type": "host", hostName: "ns1.example.test" };
    const { client } = setup((h) => reply(h, 200, { results: [domain("a.test"), host, "x"] }));
    const result = await client.domains.query({});
    expect(result.data.results).toHaveLength(3);
    expect(result.meta.warnings).toEqual([
      "Result 1 is of type host, expected domainName.",
      "Result 2 is not an RPP object, expected domainName.",
    ]);
  });

  it("reports a body that is not a result envelope, and keeps the raw body in the exchange", async () => {
    const { client } = setup((h) => reply(h, 200, [domain("a.test")]));
    const result = await client.domains.query({});
    expect(result.data.results).toEqual([]);
    expect(result.meta.warnings).toEqual(["The response is not a query result envelope with a results array."]);
    expect(result.meta.response.body).toMatchObject({ kind: "json", value: [domain("a.test")] });
  });

  it("fails on 501 when the server does not offer query", async () => {
    const problem = { type: "urn:ietf:params:rpp:error", title: "Not Implemented", errors: [{ type: "t", result: "02101", reason: "Unimplemented command" }] };
    const { client } = setup((h) => reply(h, 501, problem, "application/problem+json"));
    const error = await failure(client.contacts.query({}));
    expect(error.failure.kind).toBe("rpp-protocol");
    expect("status" in error.failure && error.failure.status).toBe(501);
  });

  it("fails on malformed JSON", async () => {
    const { client } = setup((h) => {
      const response = reply(h, 200, undefined);
      return new Response("{results:", { status: 200, headers: { ...Object.fromEntries(response.headers), "Content-Type": "application/rpp+json" } });
    });
    expect((await failure(client.domains.query({}))).failure.kind).toBe("content");
  });

  it("refuses an invalid Query Object before sending it", async () => {
    const { client, fetchMock } = setup((h) => reply(h, 200, { results: [] }));
    const invalid = { filter: { element: "name", op: "pr", value: "x" } } as unknown as QueryObject;
    const error = await failure(client.domains.query(invalid));
    expect(error.failure.kind).toBe("schema-validation");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends an invalid Query Object when validation only warns, and reports it", async () => {
    const { client, fetchMock } = setup((h) => reply(h, 200, { results: [] }));
    const invalid = { limit: 0 } as QueryObject;
    const result = await client.domains.query(invalid, { validation: "warn" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.meta.validation.request?.status).toBe("invalid");
  });

  it("is cancelled by its signal", async () => {
    const { client } = setup(() => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    const controller = new AbortController();
    controller.abort();
    const error = await failure(client.domains.query({}, { signal: controller.signal }));
    expect(error.failure.kind === "transport" && error.failure.transportKind).toBe("aborted");
  });
});
