import { describe, expect, it } from "vitest";
import { isJsonObject } from "./types/json";
import { identifierOf, isObjectOfType, isResourceType, objectTypeOf } from "./types/resources";
import { describeStatus, isKnownValue, STATUS_VOCABULARIES } from "./status/statuses";
import { expectedHttpStatus, parseResultCode } from "./status/resultCodes";
import { parseRppProblem, RPP_ERROR_TYPE } from "../errors/problem";

describe("result codes", () => {
  it("derives namespace, outcome and category from the digits", () => {
    expect(parseResultCode("02303")).toMatchObject({
      wellFormed: true,
      namespace: "epp-derived",
      outcome: "failure",
      category: "data management",
      known: true,
      description: "Object does not exist",
    });
    expect(parseResultCode("11000")).toMatchObject({ namespace: "rpp-specific", outcome: "success", known: false });
  });

  it("keeps malformed and unlisted codes inspectable", () => {
    expect(parseResultCode("2303")).toMatchObject({ wellFormed: false, outcome: undefined, raw: "2303" });
    expect(parseResultCode("")).toMatchObject({ wellFormed: false });
    expect(parseResultCode("02699")).toMatchObject({ wellFormed: false });
    const unlisted = parseResultCode("12309");
    expect(unlisted).toMatchObject({ known: false, category: "data management" });
    expect(unlisted.description).toContain("12309");
  });

  it("maps to HTTP statuses like core tables 9 and 10", () => {
    const status = (code: string) => expectedHttpStatus(parseResultCode(code));
    expect(status("01000")).toBe(200);
    expect(status("01001")).toBe(200);
    expect(status("02303")).toBe(404);
    expect(status("02302")).toBe(409);
    expect(status("02104")).toBe(402);
    expect(status("02308")).toBe(422);
    expect(status("02005")).toBe(400);
    expect(status("12100")).toBe(400);
    expect(status("02400")).toBe(500);
    expect(status("02500")).toBe(500);
    expect(status("02502")).toBe(429);
    expect(status("nope")).toBeUndefined();
  });
});

describe("statuses", () => {
  it("describes known labels and who sets them", () => {
    expect(describeStatus("domainStatus", "clientHold")).toMatchObject({ known: true, setBy: "client" });
    expect(describeStatus("domainStatus", "serverHold")).toMatchObject({ known: true, setBy: "server" });
    expect(describeStatus("domainStatus", "ok")).toMatchObject({ setBy: "server" });
    expect(describeStatus("hostStatus", "pendingTransfer").description).toContain("superordinate domain");
    expect(describeStatus("organisationStatus", "hold").setBy).toBe("client");
  });

  it("shows an unknown label as received instead of mapping it", () => {
    expect(describeStatus("domainStatus", "quarantine")).toMatchObject({
      label: "quarantine",
      known: false,
      setBy: "unknown",
    });
    expect(describeStatus("domainStatus", "clientQuarantine").setBy).toBe("client");
    expect(describeStatus("hostStatus", "rgpAddPeriod").known).toBe(false);
  });

  it("keeps the client-settable labels within the readable ones", () => {
    for (const vocabulary of Object.values(STATUS_VOCABULARIES)) {
      for (const label of vocabulary.clientSettable) expect(vocabulary.read).toContain(label);
    }
  });

  it("recognizes values of other enumerations", () => {
    expect(isKnownValue("transferStatus", "pending")).toBe(true);
    expect(isKnownValue("transferStatus", "weird")).toBe(false);
  });
});

describe("object helpers", () => {
  it("reads the type and the identifier of resource objects", () => {
    const domain = { "@type": "domainName", name: "example.test" };
    expect(objectTypeOf(domain)).toBe("domainName");
    expect(objectTypeOf([])).toBeUndefined();
    expect(objectTypeOf({ "@type": 3 })).toBeUndefined();
    expect(isObjectOfType(domain, "domainName")).toBe(true);
    expect(identifierOf(domain)).toBe("example.test");
    expect(identifierOf({ "@type": "host", hostName: "ns1.example.test" })).toBe("ns1.example.test");
    expect(identifierOf({ "@type": "period", value: 1 })).toBeUndefined();
    expect(isResourceType("contact")).toBe(true);
    expect(isResourceType("toString")).toBe(false);
    expect(isJsonObject(null)).toBe(false);
  });
});

describe("parseRppProblem", () => {
  const document = {
    type: RPP_ERROR_TYPE,
    title: "RPP Error",
    status: 402,
    errors: [
      {
        type: "https://rpp.example/problems/billing/billing-failure",
        result: "02104",
        reason: "Not enough balance",
        balance: 10.0,
        paths: ["$.domain.name"],
      },
    ],
    instance: "/x",
  };

  it("reads the problem and keeps members of extensions", () => {
    const problem = parseRppProblem(document);
    expect(problem).toMatchObject({ title: "RPP Error", status: 402, warnings: [], extensions: { instance: "/x" } });
    expect(problem?.errors[0]).toMatchObject({
      reason: "Not enough balance",
      paths: ["$.domain.name"],
      extensions: { balance: 10 },
    });
    expect(problem?.errors[0]?.result.description).toBe("Billing failure");
  });

  it("is undefined for other problem types and non-objects", () => {
    expect(parseRppProblem({ ...document, type: "about:blank" })).toBeUndefined();
    expect(parseRppProblem("x")).toBeUndefined();
    expect(parseRppProblem(null)).toBeUndefined();
  });

  it("reads leniently and warns about what core §9 requires", () => {
    const problem = parseRppProblem({ type: RPP_ERROR_TYPE, errors: [3, { type: "t" }] });
    expect(problem?.title).toBe("");
    expect(problem?.errors).toHaveLength(1);
    expect(problem?.warnings).toEqual(
      expect.arrayContaining([
        "title: expected a string",
        expect.stringContaining("errors/0"),
        expect.stringContaining("errors/1/result"),
        expect.stringContaining("errors/1/reason"),
      ]),
    );
    expect(parseRppProblem({ type: RPP_ERROR_TYPE, title: "t" })?.warnings).toContain("errors: expected an array");
  });
});
