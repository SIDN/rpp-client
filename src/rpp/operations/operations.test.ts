import { describe, expect, it, vi } from "vitest";
import { createExchangeLog } from "../client/diagnostics";
import { createFetchTransport } from "../client/FetchTransport";
import { parseLinkHeader, processLinks, queueSizeOf } from "../client/links";
import { toALabel } from "../core/idn";
import { RppError } from "../errors/RppError";
import { createSchemaRegistry, JSON_SCHEMA_2020_12 } from "../schemas/SchemaRegistry";
import { createRppClient, type RppClientConfig } from "./RppClient";

const BASE = "https://rpp.example.test/rpp";
const PRESET = { id: "urn:ietf:params:rpp:preset:epp-compatible", version: "1.0" };

type Responder = (url: URL, init: RequestInit, headers: Headers) => Response;

function setup(respond: Responder, config: Partial<RppClientConfig> = {}, onExchange?: Parameters<typeof createFetchTransport>[0]["onExchange"]) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const response = respond(input as URL, init ?? {}, new Headers(init?.headers));
    return response;
  });
  const transport = createFetchTransport({ baseUrl: BASE, fetch: fetchMock, onExchange });
  const client = createRppClient({ transport, ...config });
  const call = (index = 0) => {
    const [url, init] = fetchMock.mock.calls[index] ?? [];
    return { url: url as URL, init: init as RequestInit, headers: new Headers(init?.headers), body: init?.body as string | undefined };
  };
  return { client, fetchMock, call };
}

/** A response that echoes RPP-Cltrid like a server must. */
function reply(headers: Headers, status: number, body?: unknown, extra: Record<string, string> = {}, type = "application/rpp+json") {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": type }),
      "RPP-Cltrid": headers.get("RPP-Cltrid") ?? "",
      "RPP-Svtrid": "S-1",
      "RPP-Code": status < 300 ? "01000" : "02303",
      ...extra,
    },
  });
}

const problem = (result = "02303") => ({ type: "urn:ietf:params:rpp:error", title: "RPP Error", errors: [{ type: "t", result, reason: "No such object" }] });
const domain = { "@type": "domainName", name: "example.test", provMetadata: { "@type": "provMetadata", spClientId: "X" }, status: [] };

async function failure(promise: Promise<unknown>): Promise<RppError> {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(RppError);
  return error as RppError;
}

describe("read", () => {
  it("sends GET with the transaction id, language, parameters and object authorisation", async () => {
    const log = createExchangeLog();
    const { client, call } = setup((_u, _i, h) => reply(h, 200, domain, { "RPP-Queue-Size": "4" }), {}, log.record);
    const result = await client.domains.read("example.test", {
      includeElements: ["authInfo", "dns"],
      parameters: { hostsFilter: "del" },
      language: "en",
      authorization: { value: "My Secret Token", roid: "REG-123" },
    });
    const { url, init, headers } = call();
    expect(init.method).toBe("GET");
    expect(url.href).toBe("https://rpp.example.test/rpp/domainNames/example.test?hostsFilter=del&includeElements=authInfo&includeElements=dns");
    expect(headers.get("RPP-Cltrid")).toMatch(/\w+/);
    expect(headers.get("Accept-Language")).toBe("en");
    expect(headers.get("RPP-Authorization")).toBe("authinfo value=TXkgU2VjcmV0IFRva2Vu, roid=REG-123");
    expect(init.body).toBeUndefined();

    expect(result.data.name).toBe("example.test");
    expect(result.meta).toMatchObject({
      status: 200,
      queueSize: 4,
      resultCode: { raw: "01000" },
      correlation: { clientTransactionId: headers.get("RPP-Cltrid"), serverTransactionId: "S-1" },
      warnings: [],
    });
    expect(JSON.stringify(log.entries())).not.toContain("TXkgU2VjcmV0IFRva2Vu");
    expect(log.entries()[0]?.id).toBe(result.meta.exchangeId);
  });

  it("uses the transaction id of the caller and warns when the server does not echo it", async () => {
    const { client, call } = setup(() => new Response(JSON.stringify(domain), { headers: { "Content-Type": "application/rpp+json", "RPP-Code": "01000", "RPP-Cltrid": "OTHER" } }));
    const result = await client.domains.read("example.test", { clientTransactionId: "MINE-1" });
    expect(call().headers.get("RPP-Cltrid")).toBe("MINE-1");
    expect(result.meta.warnings).toEqual([expect.stringContaining("different RPP-Cltrid")]);
  });

  it("warns about a response of another type", async () => {
    const { client } = setup((_u, _i, h) => reply(h, 200, { "@type": "host", hostName: "x" }));
    expect((await client.domains.read("example.test")).meta.warnings).toEqual([expect.stringContaining("of type host, expected domainName")]);
  });

  it("keeps the problem of a failure, with the exchange", async () => {
    const { client } = setup((_u, _i, h) => reply(h, 404, problem(), {}, "application/problem+json"));
    const error = await failure(client.domains.read("nope.test"));
    expect(error.failure).toMatchObject({ kind: "rpp-protocol", status: 404, resultCode: { raw: "02303" } });
  });

  it("rejects, never resolves, on transport and authentication failures", async () => {
    const down = setup(() => {
      throw new TypeError("offline");
    });
    expect((await failure(down.client.hosts.read("ns1.example.test"))).failure).toMatchObject({ kind: "transport", transportKind: "network" });
    const denied = setup((_u, _i, h) => reply(h, 401, problem("02200"), {}, "application/problem+json"));
    expect((await failure(denied.client.hosts.read("ns1.example.test"))).failure.kind).toBe("authentication");
  });
});

describe("identifiers", () => {
  it("requires the A-label of a name and encodes other identifiers", async () => {
    const { client, call, fetchMock } = setup((_u, _i, h) => reply(h, 200, domain));
    const error = await failure(client.domains.read("bücher.example"));
    expect(error.failure).toMatchObject({ kind: "transport", transportKind: "invalid-request" });
    expect(error.message).toContain("A-label");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toALabel("bücher.example")).toBe("xn--bcher-kva.example");
    expect(toALabel("example.test")).toBe("example.test");

    await client.domains.read(toALabel("bücher.example") ?? "");
    expect(call().url.pathname).toBe("/rpp/domainNames/xn--bcher-kva.example");
    await client.contacts.read("a/b c");
    expect(call(1).url.pathname).toBe("/rpp/contacts/a%2Fb%20c");
  });

  it("refuses identifiers that would change the path", async () => {
    const { client, fetchMock } = setup((_u, _i, h) => reply(h, 200, domain));
    for (const id of ["", ".", ".."]) await failure(client.contacts.read(id));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("create, update and delete", () => {
  it("creates with POST and reports the location and the processes created", async () => {
    const link = '<https://rpp.example.test/rpp/domainNames/example.test/processes/createProcesses/latest>; rel="rpp-process"; process="createProcess"; processId="XYZ-12345", <https://x.test/other>; rel="next"';
    const { client, call } = setup((_u, _i, h) =>
      reply(h, 201, domain, { Location: "https://rpp.example.test/rpp/domainNames/example.test", Link: link }),
    );
    const result = await client.domains.create({ "@type": "domainName", name: "example.test" });
    const { url, init, headers, body } = call();
    expect(init.method).toBe("POST");
    expect(url.pathname).toBe("/rpp/domainNames");
    expect(headers.get("Content-Type")).toBe("application/rpp+json");
    expect(JSON.parse(body ?? "")).toEqual({ "@type": "domainName", name: "example.test" });
    expect(result.meta.status).toBe(201);
    expect(result.meta.location).toBe("https://rpp.example.test/rpp/domainNames/example.test");
    expect(result.meta.processes).toEqual([
      { url: "https://rpp.example.test/rpp/domainNames/example.test/processes/createProcesses/latest", process: "createProcess", processId: "XYZ-12345", latest: false },
    ]);
  });

  it("replaces with PUT and patches with a JSON Patch array", async () => {
    const { client, call } = setup((_u, _i, h) => reply(h, 200, domain));
    await client.hosts.replace("ns1.example.test", { "@type": "host", hostName: "ns1.example.test" });
    expect(call().init.method).toBe("PUT");
    await client.domains.patch("example.test", [
      { op: "add", path: "/nameservers/-", value: { "@type": "host", hostName: "ns1.example.test" } },
      { op: "remove", path: "/contacts", match: { label: "tech" } },
    ]);
    const patch = call(1);
    expect(patch.init.method).toBe("PATCH");
    expect(JSON.parse(patch.body ?? "")).toHaveLength(2);
  });

  it("refuses patches that json §5.2 forbids, without sending", async () => {
    const { client, fetchMock } = setup((_u, _i, h) => reply(h, 200, domain));
    const bad: unknown[][] = [
      [],
      [{ op: "move", path: "/a", from: "/b" }],
      [{ op: "replace", path: "a", value: 1 }],
      [{ op: "add", path: "/a" }],
      [{ op: "add", path: "/a", value: 1, match: {} }],
      [{ op: "remove", path: "/a", value: 1 }],
      [{ op: "remove", path: "/a", match: "x" }],
    ];
    for (const operations of bad) await failure(client.domains.patch("example.test", operations as never));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes without content and returns what the server sends", async () => {
    const { client, call } = setup((_u, _i, h) => reply(h, 200, { "@type": "domainName" }));
    const result = await client.contacts.delete("C-1");
    expect(call().init.method).toBe("DELETE");
    expect(call().init.body).toBeUndefined();
    expect(call().headers.has("Content-Type")).toBe(false);
    expect(result.data).toEqual({ "@type": "domainName" });
  });
});

describe("availability", () => {
  const available = { "@type": "domainNameAvailability", available: true };
  const taken = { "@type": "domainNameAvailability", available: false, reason: "in use" };

  it("reads the answer of GET and passes the IDN parameters", async () => {
    const { client, call } = setup((_u, _i, h) => reply(h, 200, available));
    const result = await client.domains.availability("xn--bcher-kva.example", { parameters: { uName: "bücher.example", lgr: "example-latn-1.0" } });
    expect(result).toMatchObject({ available: true, details: available });
    expect(call().url.search).toBe("?uName=b%C3%BCcher.example&lgr=example-latn-1.0");
    expect(call().url.pathname).toBe("/rpp/domainNames/xn--bcher-kva.example/availability");
  });

  it("treats 404 as an answer, with or without the Availability Object", async () => {
    const withObject = setup((_u, _i, h) => reply(h, 404, taken));
    expect(await withObject.client.domains.availability("taken.test")).toMatchObject({ available: false, details: taken, meta: { warnings: [] } });
    const head = setup((_u, _i, h) => reply(h, 404, undefined, { "RPP-Code": "01000" }));
    const answer = await head.client.domains.availability("taken.test", { method: "HEAD" });
    expect(answer).toMatchObject({ available: false, details: undefined });
    expect(head.call().init.method).toBe("HEAD");
  });

  it("warns about contradictions and missing objects", async () => {
    const contradicting = setup((_u, _i, h) => reply(h, 200, taken));
    expect((await contradicting.client.domains.availability("x.test")).meta.warnings).toEqual([expect.stringContaining("contradicts")]);
    const empty = setup((_u, _i, h) => reply(h, 200, { "@type": "other" }));
    expect((await empty.client.domains.availability("x.test")).meta.warnings).toEqual([expect.stringContaining("no domainNameAvailability object")]);
  });

  it("fails for a 404 problem, other statuses, and resources without availability", async () => {
    const missing = setup((_u, _i, h) => reply(h, 404, problem(), {}, "application/problem+json"));
    expect((await failure(missing.client.domains.availability("x.test"))).failure.kind).toBe("rpp-protocol");
    const broken = setup((_u, _i, h) => reply(h, 500, undefined));
    expect((await failure(broken.client.hosts.availability("ns1.example.test", { method: "HEAD" }))).failure.kind).toBe("http");
    const partial = setup((_u, _i, h) => reply(h, 204, undefined));
    expect((await failure(partial.client.hosts.availability("ns1.example.test", { method: "HEAD" }))).failure).toMatchObject({ kind: "http", status: 204 });
    const none = setup((_u, _i, h) => reply(h, 200, {}));
    await failure(none.client.organisations.availability("O-1"));
    expect(none.fetchMock).not.toHaveBeenCalled();
  });
});

describe("processes", () => {
  const process = { "@type": "domainTransferProcess", trStatus: "pending" };

  it("starts, reads, cancels, approves and rejects a transfer at the paths of core Rule 4 and 5", async () => {
    const { client, call } = setup((_u, _i, h) => reply(h, 200, process));
    const transfer = client.domains.processes.transfer;
    if (!transfer) throw new Error("no transfer");
    await transfer.create("example.test", undefined, { authorization: { value: "secret" } });
    await transfer.read("example.test", "latest");
    await transfer.read("example.test", { processId: "P 1" });
    await transfer.delete("example.test", "latest");
    await transfer.approve("example.test", "latest");
    await transfer.reject("example.test", { processId: "P-1" }, { "@type": "domainTransferProcess", reason: "no" });
    const seen = [0, 1, 2, 3, 4, 5].map((index) => `${call(index).init.method} ${call(index).url.pathname}`);
    expect(seen).toEqual([
      "POST /rpp/domainNames/example.test/processes/transferProcesses",
      "GET /rpp/domainNames/example.test/processes/transferProcesses/latest",
      "GET /rpp/domainNames/example.test/processes/transferProcesses/P%201",
      "DELETE /rpp/domainNames/example.test/processes/transferProcesses/latest",
      "POST /rpp/domainNames/example.test/processes/transferProcesses/latest/transferApprove",
      "POST /rpp/domainNames/example.test/processes/transferProcesses/P-1/transferReject",
    ]);
    expect(call(0).init.body).toBeUndefined();
    expect(call(0).headers.get("RPP-Authorization")).toMatch(/^authinfo value=/);
    expect(call(3).init.body).toBeUndefined();
    expect(JSON.parse(call(5).body ?? "")).toMatchObject({ reason: "no" });
  });

  it("restores with PUT or PATCH and renews with POST", async () => {
    const { client, call } = setup((_u, _i, h) => reply(h, 200, { "@type": "restoreProcess", restoreStatus: "pendingRestore" }));
    const { restore, renew } = client.domains.processes;
    await restore?.create("example.test");
    await restore?.update("example.test", "latest", { "@type": "restoreProcess" });
    await restore?.update("example.test", "latest", [{ op: "replace", path: "/restoreReport", value: {} }], { method: "PATCH" });
    await renew?.create("example.test", { "@type": "renewProcess" });
    expect([0, 1, 2, 3].map((i) => call(i).init.method)).toEqual(["POST", "PUT", "PATCH", "POST"]);
    expect(call(3).url.pathname).toBe("/rpp/domainNames/example.test/processes/renewProcesses");
  });

  it("knows which processes and operations a resource has", async () => {
    const { client, fetchMock } = setup((_u, _i, h) => reply(h, 200, {}));
    expect(Object.keys(client.domains.processes).sort()).toEqual(["create", "renew", "restore", "transfer"]);
    expect(Object.keys(client.contacts.processes)).toEqual(["transfer"]);
    expect(Object.keys(client.hosts.processes)).toEqual(["transfer"]);
    expect(client.organisations.processes).toEqual({});
    const renew = client.domains.processes.renew;
    expect(renew?.supports("read")).toBe(false);
    await failure(Promise.resolve().then(() => renew?.read("example.test", "latest")));
    await failure(Promise.resolve().then(() => client.domains.processes.create?.create("example.test")));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists the processes of an object", async () => {
    const { client, call } = setup((_u, _i, h) => reply(h, 200, []));
    await client.contacts.listProcesses("C-1");
    expect(call().url.pathname).toBe("/rpp/contacts/C-1/processes");
  });
});

describe("organisations, users and messages", () => {
  it("addresses users below their organisation", async () => {
    const { client, call } = setup((_u, _i, h) => reply(h, 200, { "@type": "user" }));
    await client.users("ORG-1").read("U-1");
    await client.users("ORG-1").create({ "@type": "user", id: "U-2", details: {} });
    expect(call().url.pathname).toBe("/rpp/organisations/ORG-1/users/U-1");
    expect(call(1).url.pathname).toBe("/rpp/organisations/ORG-1/users");
  });

  it("queries messages by type, reads and acknowledges them", async () => {
    const message = { "@type": "message", id: "M-1" };
    const { client, call } = setup((_u, _i, h) => reply(h, 200, [message], { "RPP-Code": "01301", "RPP-Queue-Size": "3" }));
    const result = await client.messages.query({ types: ["transferRequestMessage", "serviceNoticeMessage"] });
    expect(call().url.search).toBe("?type=transferRequestMessage&type=serviceNoticeMessage");
    expect(result.data).toEqual([message]);
    expect(result.meta).toMatchObject({ queueSize: 3, resultCode: { raw: "01301" } });

    await client.messages.acknowledge("M 1");
    expect(`${call(1).init.method} ${call(1).url.pathname}`).toBe("DELETE /rpp/messages/M%201");
    await client.messages.read("M-1");
    expect(call(2).url.pathname).toBe("/rpp/messages/M-1");
  });

  it("returns an empty list when no message is queued", async () => {
    const { client } = setup((_u, _i, h) => reply(h, 200, undefined, { "RPP-Code": "01300" }));
    expect((await client.messages.query()).data).toEqual([]);
  });

  it("returns every message of a list, and a lone message as a list of one, without a warning", async () => {
    const messages = [1, 2, 3].map((n) => ({ "@type": "message", id: `M-${n}` }));
    const many = setup((_u, _i, h) => reply(h, 200, messages, { "RPP-Code": "01301" }));
    expect((await many.client.messages.query()).data).toEqual(messages);

    const lone = setup((_u, _i, h) => reply(h, 200, messages[0], { "RPP-Code": "01301" }));
    const result = await lone.client.messages.query();
    expect(result.data).toEqual([messages[0]]);
    expect(result.meta.warnings).toEqual([]);
  });

  it("warns when the answer is neither a message nor a list of them", async () => {
    const { client } = setup((_u, _i, h) => reply(h, 200, { "@type": "domainName" }, { "RPP-Code": "01301" }));
    expect((await client.messages.query()).meta.warnings.some((warning) => warning.includes("not a list of messages"))).toBe(true);
  });
});

describe("schema validation", () => {
  const schema = {
    $schema: JSON_SCHEMA_2020_12,
    "rpp:preset": PRESET,
    $defs: {
      "domainName.create": {
        type: "object",
        properties: { "@type": { const: "domainName" }, name: { type: "string" } },
        required: ["@type", "name"],
      },
      "domainName.read": {
        type: "object",
        properties: { "@type": { const: "domainName" }, name: { type: "string" }, expiryDate: { type: "string" } },
        required: ["@type", "name", "expiryDate"],
      },
    },
  };
  const registry = () => {
    const created = createSchemaRegistry();
    created.addPresetSchema(schema, PRESET);
    return created;
  };

  it("refuses to send an invalid request, with the location of each issue", async () => {
    const { client, fetchMock } = setup((_u, _i, h) => reply(h, 201, domain), { validation: { registry: registry(), preset: PRESET } });
    const error = await failure(client.domains.create({ "@type": "domainName" } as never));
    expect(error.failure).toMatchObject({ kind: "schema-validation", direction: "request", definition: "domainName.create" });
    expect(error.failure.kind === "schema-validation" && error.failure.issues[0]).toMatchObject({ keyword: "required", params: { missingProperty: "name" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a call skip or soften the check, for sending a broken request on purpose", async () => {
    const { client, fetchMock } = setup((_u, _i, h) => reply(h, 201, domain), { validation: { registry: registry(), preset: PRESET } });
    const result = await client.domains.create({ "@type": "domainName" } as never, { validation: "warn" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.meta.validation.request).toMatchObject({ status: "invalid" });
    await client.domains.create({ "@type": "domainName" } as never, { validation: "off" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports an invalid response by default and refuses it on request", async () => {
    const config = { registry: registry(), preset: PRESET };
    const warn = setup((_u, _i, h) => reply(h, 200, domain), { validation: config });
    const result = await warn.client.domains.read("example.test");
    expect(result.meta.validation.response).toMatchObject({ status: "invalid" });
    const enforce = setup((_u, _i, h) => reply(h, 200, domain), { validation: { ...config, response: "enforce" } });
    expect((await failure(enforce.client.domains.read("example.test"))).failure).toMatchObject({ kind: "schema-validation", direction: "response" });
  });

  it("does not claim validation when no schema applies", async () => {
    const { client } = setup((_u, _i, h) => reply(h, 200, domain), { validation: { registry: createSchemaRegistry(), preset: PRESET } });
    expect((await client.domains.read("example.test")).meta.validation.response).toMatchObject({ status: "unavailable" });
    const without = setup((_u, _i, h) => reply(h, 200, domain));
    expect((await without.client.domains.read("example.test")).meta.validation).toEqual({});
  });
});

describe("link and queue headers", () => {
  it("parses Link values with quoted strings and commas in targets", () => {
    expect(parseLinkHeader('<https://a.test/x,y>; rel="a, b"; title="q\\"uote", <https://b.test/>; rel=next')).toEqual([
      { target: "https://a.test/x,y", parameters: { rel: "a, b", title: 'q"uote' } },
      { target: "https://b.test/", parameters: { rel: "next" } },
    ]);
    expect(parseLinkHeader("garbage")).toEqual([]);
  });

  it("reads process links and flags those without a process attribute", () => {
    const headers = new Headers();
    headers.append("Link", '<https://a.test/p/latest>; rel="rpp-process"; process="transferProcess"; latest="true"');
    headers.append("Link", '<https://a.test/q>; rel="rpp-process"');
    const { links, warnings } = processLinks(headers);
    expect(links).toEqual([{ url: "https://a.test/p/latest", process: "transferProcess", processId: undefined, latest: true }]);
    expect(warnings).toEqual([expect.stringContaining("no process attribute")]);
  });

  it("reads the queue size and warns about junk", () => {
    expect(queueSizeOf(new Headers({ "RPP-Queue-Size": "0" })).size).toBe(0);
    expect(queueSizeOf(new Headers({ "RPP-Queue-Size": "-1" }))).toMatchObject({ size: undefined, warnings: [expect.any(String)] });
    expect(queueSizeOf(new Headers())).toEqual({ size: undefined, warnings: [] });
  });
});
