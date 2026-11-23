import { describe, expect, it } from "vitest";
import {
  ACTIVE,
  ANY,
  NO_FILTER,
  filterRows,
  pageOf,
  processRefsOf,
  rowOf,
  sortRows,
  statusOptions,
  type ProcessRef,
  type ProcessRow,
  type SeenObject,
} from "./processList";

const DOMAIN: SeenObject = {
  type: "domainName",
  id: "example.test",
  processes: {
    transferProcess: [{ processId: "T1" }, { processId: "T2" }],
    renewProcess: [{ processId: "N1" }],
    restoreProcess: [{ processId: "R1" }],
    createProcess: [{ processId: "" }, { nope: true }, "x"],
  },
};
const CONTACT: SeenObject = { type: "contact", id: "C-1", processes: { transferProcess: [{ processId: "T9" }] } };

const ref = (overrides: Partial<ProcessRef> = {}): ProcessRef => ({ objectType: "domainName", objectId: "example.test", kind: "transfer", processId: "T1", ...overrides });
const ready = (process: unknown) => ({ state: "ready", process }) as const;
const transfer = (processId: string, status: string, requestDate?: string, objectType: ProcessRef["objectType"] = "domainName") =>
  rowOf(ref({ processId, objectType }), ready({ trStatus: status, requestDate }));

describe("processRefsOf", () => {
  it("lists the processes each object names, and skips what is not a process reference", () => {
    expect(processRefsOf([DOMAIN, CONTACT]).map((entry) => `${entry.objectType}/${entry.objectId}/${entry.kind}/${entry.processId}`)).toEqual([
      "domainName/example.test/transfer/T1",
      "domainName/example.test/transfer/T2",
      "domainName/example.test/renew/N1",
      "domainName/example.test/restore/R1",
      "contact/C-1/transfer/T9",
    ]);
  });

  it("yields nothing for an object without a processes member", () => {
    expect(processRefsOf([{ type: "host", id: "ns1.example.test", processes: undefined }, { type: "host", id: "ns2.example.test", processes: "x" }])).toEqual([]);
  });
});

describe("rowOf", () => {
  it("takes the status of a transfer and who asked and who acts", () => {
    const row = rowOf(ref(), ready({ trStatus: "pending", requestDate: "2026-01-02T00:00:00Z", reqClientId: "REG-1", actClientId: "REG-2" }));
    expect(row).toMatchObject({ status: "pending", requested: "2026-01-02T00:00:00Z", parties: "REG-1 → REG-2" });
  });

  it("takes the status of a restore", () => {
    expect(rowOf(ref({ kind: "restore" }), ready({ restoreStatus: "pendingRestore" })).status).toBe("pendingRestore");
  });

  it("has no status before the process is read, or for a kind without one", () => {
    expect(rowOf(ref(), { state: "loading" }).status).toBeUndefined();
    expect(rowOf(ref({ kind: "create" }), ready({ trStatus: "pending" })).status).toBeUndefined();
  });

  it("keeps a status it does not know", () => {
    expect(rowOf(ref(), ready({ trStatus: "somethingNew" })).status).toBe("somethingNew");
  });
});

describe("filterRows", () => {
  const rows: ProcessRow[] = [
    transfer("T1", "pending"),
    transfer("T2", "serverApproved"),
    transfer("T3", "pending", undefined, "contact"),
    rowOf(ref({ kind: "restore", processId: "R1" }), ready({ restoreStatus: "pendingRestore" })),
    rowOf(ref({ kind: "renew", processId: "N1" }), { state: "unreadable" }),
  ];
  const ids = (filtered: ProcessRow[]) => filtered.map((row) => row.processId);

  it("keeps everything without a filter", () => {
    expect(filterRows(rows, NO_FILTER)).toHaveLength(5);
  });

  it("shows the active transfer processes of domain names", () => {
    expect(ids(filterRows(rows, { objectType: "domainName", kind: "transfer", status: ACTIVE }))).toEqual(["T1"]);
  });

  it("counts a pending restore as active, and a process without a status as not", () => {
    expect(ids(filterRows(rows, { ...NO_FILTER, status: ACTIVE }))).toEqual(["T1", "T3", "R1"]);
  });

  it("filters on one status", () => {
    expect(ids(filterRows(rows, { ...NO_FILTER, status: "serverApproved" }))).toEqual(["T2"]);
  });

  it("filters on the object type alone", () => {
    expect(ids(filterRows(rows, { ...NO_FILTER, objectType: "contact" }))).toEqual(["T3"]);
  });
});

describe("sortRows", () => {
  it("puts the newest request first and the undated ones last, keeping their order", () => {
    const rows = [transfer("A", "pending"), transfer("B", "pending", "2026-01-01T00:00:00Z"), transfer("C", "pending"), transfer("D", "pending", "2026-02-01T00:00:00Z")];
    expect(sortRows(rows).map((row) => row.processId)).toEqual(["D", "B", "A", "C"]);
  });
});

describe("statusOptions", () => {
  it("offers the statuses of the draft for a kind, and the ones the server showed besides", () => {
    expect(statusOptions([transfer("T1", "odd")], "transfer")).toEqual(["pending", "clientApproved", "clientCancelled", "clientRejected", "serverApproved", "serverCancelled", "odd"]);
    expect(statusOptions([], "restore")).toEqual(["pendingRestore", "restored", "rgpPendingDelete"]);
  });

  it("offers those of transfers and restores for all kinds, and none for a kind without a status", () => {
    expect(statusOptions([], ANY)).toContain("pending");
    expect(statusOptions([], ANY)).toContain("restored");
    expect(statusOptions([], "renew")).toEqual([]);
  });
});

describe("pageOf", () => {
  const items = Array.from({ length: 60 }, (_, index) => index + 1);

  it("gives the first page and where it stands", () => {
    const page = pageOf(items, 1, 25);
    expect(page).toMatchObject({ page: 1, pages: 3, from: 1, to: 25, total: 60 });
    expect(page.items).toHaveLength(25);
  });

  it("gives a short last page", () => {
    const page = pageOf(items, 3, 25);
    expect(page).toMatchObject({ from: 51, to: 60 });
    expect(page.items).toEqual(items.slice(50));
  });

  it("keeps the page within the pages there are", () => {
    expect(pageOf(items, 9, 25).page).toBe(3);
    expect(pageOf(items, 0, 25).page).toBe(1);
    expect(pageOf(items, Number.NaN, 25).page).toBe(1);
  });

  it("has one empty page when there is nothing", () => {
    expect(pageOf([], 1, 25)).toMatchObject({ items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });
});
