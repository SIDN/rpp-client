import { describe, expect, it, vi } from "vitest";
import { createFetchTransport } from "@/rpp/client/FetchTransport";
import { RppError } from "@/rpp/errors/RppError";
import { createRppClient } from "@/rpp/operations/RppClient";
import { createDomainWorkflows, parseDomainName, registerBody } from "./domainWorkflows";

const BASE = "https://rpp.example.test/rpp";

function setup(body: unknown = { "@type": "domainName", name: "example.test", provMetadata: { "@type": "provMetadata", spClientId: "X" }, status: [] }, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(
    async (_input, init) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/rpp+json" }),
          "RPP-Cltrid": new Headers(init?.headers).get("RPP-Cltrid") ?? "",
          "RPP-Code": "01000",
        },
      }),
  );
  const workflows = createDomainWorkflows(createRppClient({ transport: createFetchTransport({ baseUrl: BASE, fetch: fetchMock }) }));
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

const restoreReport = {
  preData: "before",
  postData: "after",
  deleteTime: "2026-01-10T12:00:00.000Z",
  restoreTime: "2026-01-20T15:30:00.000Z",
  restoreReason: "deleted in error",
  statements: ["true", "valid reason"],
};

describe("domain names", () => {
  it("is the A-label of what was typed, without other changes", () => {
    expect(parseDomainName("  Example.TEST ")).toEqual({ name: "Example.TEST", unicode: undefined });
    expect(parseDomainName("bücher.example")).toEqual({ name: "xn--bcher-kva.example", unicode: "bücher.example" });
    expect(() => parseDomainName("   ")).toThrow(RppError);
  });

  it("is refused before anything is sent when it cannot be a name", async () => {
    const { workflows, fetchMock } = setup();
    await expect(workflows.info("")).rejects.toBeInstanceOf(RppError);
    await expect(workflows.remove(" ")).rejects.toBeInstanceOf(RppError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("check and lookup", () => {
  it("checks availability with GET, so that the reason comes with it", async () => {
    const { workflows, last } = setup({ "@type": "domainNameAvailability", available: false, reason: "in use" }, 404);
    const result = await workflows.check("bücher.example");
    expect(last()).toMatchObject({ method: "GET", path: "/rpp/domainNames/xn--bcher-kva.example/availability" });
    expect(result).toMatchObject({ available: false, details: { reason: "in use" } });
  });

  it("looks up a domain, asking for the authorisation information only when told to", async () => {
    const { workflows, last } = setup();
    await workflows.info("example.test");
    expect(last()).toMatchObject({ method: "GET", path: "/rpp/domainNames/example.test" });
    await workflows.info("example.test", { authInfo: true });
    expect(last().path).toBe("/rpp/domainNames/example.test?includeElements=authInfo");
  });
});

describe("register", () => {
  it("sends what was entered and nothing else", () => {
    expect(registerBody({ name: "example.test" })).toEqual({ "@type": "domainName", name: "example.test" });
    expect(
      registerBody({
        name: "example.test",
        period: { value: 2, unit: "y" },
        registrant: "C-1",
        contacts: [{ label: "tech", id: "C-2" }],
        nameservers: ["ns1.example.test"],
        authInfo: "s3cret",
      }),
    ).toEqual({
      "@type": "domainName",
      name: "example.test",
      registrant: { "@type": "contact", id: "C-1" },
      contacts: [{ label: "tech", object: { "@type": "contact", id: "C-2" } }],
      nameservers: [{ "@type": "host", hostName: "ns1.example.test" }],
      authInfo: { "@type": "authInfo", method: "authinfo", authdata: "s3cret" },
      processes: { "@type": "processes", createProcess: [{ "@type": "domainCreateProcess", period: { "@type": "period", value: 2, unit: "y" } }] },
    });
  });

  it("refuses a contact role other than admin, billing or tech", () => {
    expect(() => registerBody({ name: "example.test", contacts: [{ label: "owner", id: "C-1" }] })).toThrow("admin, billing or tech");
    for (const label of ["admin", "billing", "tech"]) {
      expect(registerBody({ name: "example.test", contacts: [{ label, id: "C-1" }] })).toMatchObject({ contacts: [{ label }] });
    }
  });

  it("names the A-label and the Unicode name of an internationalized domain, which needs its LGR", () => {
    expect(registerBody({ name: "bücher.example", lgr: "de" })).toMatchObject({ name: "xn--bcher-kva.example", uName: "bücher.example", lgr: "de" });
    expect(() => registerBody({ name: "bücher.example" })).toThrow("Label Generation Ruleset");
  });

  it("creates with POST", async () => {
    const { workflows, last } = setup();
    const result = await workflows.register({ name: "example.test" });
    expect(last()).toMatchObject({ method: "POST", path: "/rpp/domainNames", body: { "@type": "domainName", name: "example.test" } });
    expect(result.data.name).toBe("example.test");
  });
});

describe("change, renew and delete", () => {
  it("patches with the operations given", async () => {
    const { workflows, last } = setup();
    await workflows.change("example.test", [{ op: "remove", path: "/registrant" }]);
    expect(last()).toMatchObject({ method: "PATCH", path: "/rpp/domainNames/example.test", body: [{ op: "remove", path: "/registrant" }] });
  });

  it("renews with the expiry date and period that were given", async () => {
    const { workflows, last } = setup({ "@type": "renewProcess", expiryDate: "2028-01-01T00:00:00Z" });
    const result = await workflows.renew("example.test", { expiryDate: "2026-01-01T00:00:00Z", period: { value: 2, unit: "y" } });
    expect(last()).toMatchObject({
      method: "POST",
      path: "/rpp/domainNames/example.test/processes/renewProcesses",
      body: { "@type": "renewProcess", expiryDate: "2026-01-01T00:00:00Z", renewalPeriod: { "@type": "period", value: 2, unit: "y" } },
    });
    expect(result.data.expiryDate).toBe("2028-01-01T00:00:00Z");
    await workflows.renew("example.test", {});
    expect(last().body).toEqual({ "@type": "renewProcess" });
  });

  it("deletes with DELETE and no body", async () => {
    const { workflows, last } = setup(undefined);
    await workflows.remove("example.test");
    expect(last()).toMatchObject({ method: "DELETE", path: "/rpp/domainNames/example.test", body: undefined });
  });
});

describe("restore", () => {
  it("requests, reports and reads the status of the latest restore", async () => {
    const { workflows, last } = setup({ "@type": "restoreProcess", restoreStatus: "pendingRestore" });
    await workflows.restore.request("example.test");
    expect(last()).toMatchObject({ method: "POST", path: "/rpp/domainNames/example.test/processes/restoreProcesses", body: { "@type": "restoreProcess" } });

    await workflows.restore.report("example.test", restoreReport);
    expect(last()).toMatchObject({
      method: "PUT",
      path: "/rpp/domainNames/example.test/processes/restoreProcesses/latest",
      body: { "@type": "restoreProcess", restoreReport: { "@type": "restoreReport", ...restoreReport } },
    });

    const status = await workflows.restore.status("example.test");
    expect(last()).toMatchObject({ method: "GET", path: "/rpp/domainNames/example.test/processes/restoreProcesses/latest" });
    expect(status.data.restoreStatus).toBe("pendingRestore");
  });

  it("can send the report with the request", async () => {
    const { workflows, last } = setup({ "@type": "restoreProcess", restoreStatus: "restored" });
    await workflows.restore.request("example.test", { ...restoreReport, other: "note" });
    expect(last().body).toMatchObject({ restoreReport: { statements: restoreReport.statements, other: "note" } });
  });
});

describe("transfer", () => {
  it("requests with the password in RPP-Authorization and not in the body", async () => {
    const { workflows, last } = setup({ "@type": "domainTransferProcess", trStatus: "pending" });
    await workflows.transfer.request("example.test", { authInfo: "My Secret", period: { value: 1, unit: "y" } });
    const request = last();
    expect(request).toMatchObject({ method: "POST", path: "/rpp/domainNames/example.test/processes/transferProcesses" });
    expect(request.headers.get("RPP-Authorization")).toBe(`authinfo value=${btoa("My Secret")}`);
    expect(request.body).toEqual({ "@type": "domainTransferProcess", transferPeriod: { "@type": "period", value: 1, unit: "y" } });
    expect(JSON.stringify(request.body)).not.toContain("Secret");
  });

  it("reads, cancels, approves and rejects the latest transfer", async () => {
    const { workflows, last } = setup({ "@type": "domainTransferProcess", trStatus: "pending" });
    const base = "/rpp/domainNames/example.test/processes/transferProcesses/latest";
    await workflows.transfer.status("example.test");
    expect(last()).toMatchObject({ method: "GET", path: base });
    await workflows.transfer.cancel("example.test");
    expect(last()).toMatchObject({ method: "DELETE", path: base });
    await workflows.transfer.approve("example.test");
    expect(last()).toMatchObject({ method: "POST", path: `${base}/transferApprove` });
    await workflows.transfer.reject("example.test");
    expect(last()).toMatchObject({ method: "POST", path: `${base}/transferReject` });
  });
});
