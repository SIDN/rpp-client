import { describe, expect, it } from "vitest";
import { processViewOf } from "./process";

describe("processViewOf", () => {
  it("is nothing for what is not an object", () => {
    expect(processViewOf(undefined)).toBeUndefined();
    expect(processViewOf("P-1")).toBeUndefined();
    expect(processViewOf([1])).toBeUndefined();
  });

  it("lists the members of a transfer process in the order of the draft", () => {
    const view = processViewOf({ "@type": "domainTransferProcess", processId: "T-1", actionDate: "2026-01-02T00:00:00Z", trStatus: "pending", reqClientId: "A", transferPeriod: { unit: "y", value: 1 } });
    expect(view).toMatchObject({ type: "domainTransferProcess", kind: "transfer", id: "T-1", others: [] });
    expect(view?.fields).toEqual([
      { term: "Transfer status", value: "pending", kind: "code" },
      { term: "Requested by", value: "A", kind: "code" },
      { term: "Action date", value: "2026-01-02T00:00:00Z", kind: "time" },
      { term: "Transfer period", value: '{"unit":"y","value":1}', kind: "code" },
    ]);
  });

  it("tells the kind by the type, or by a status member", () => {
    expect(processViewOf({ "@type": "renewProcess" })?.kind).toBe("renew");
    expect(processViewOf({ "@type": "restoreProcess" })?.kind).toBe("restore");
    expect(processViewOf({ "@type": "domainCreateProcess" })?.kind).toBe("create");
    expect(processViewOf({ trStatus: "pending" })?.kind).toBe("transfer");
    expect(processViewOf({ restoreStatus: "restored" })?.kind).toBe("restore");
    expect(processViewOf({ "@type": "mystery" })?.kind).toBeUndefined();
  });

  it("keeps members it does not know", () => {
    expect(processViewOf({ "@type": "createProcess", processId: "P", extra: 1 })?.others).toEqual([["extra", 1]]);
  });
});
