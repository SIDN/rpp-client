import { isJsonObject } from "@/rpp/core/types/json";
import type { ProcessKind } from "@/rpp/operations/definitions";

export interface ProcessField {
  term: string;
  value: string;
  /** `time` is shown as a date and time, `code` in monospace. */
  kind: "text" | "time" | "code";
}

export interface ProcessView {
  /** The `@type` the server gave, for example `domainTransferProcess`. */
  type: string;
  /** What kind of process it is, when its type or its members tell. */
  kind: ProcessKind | undefined;
  id: string;
  fields: ProcessField[];
  others: [string, unknown][];
}

/** The members the Process Objects of the draft define (§9.17, §10 and §11.4), in the order shown. */
const MEMBERS: readonly { member: string; term: string; time?: boolean }[] = [
  { member: "trStatus", term: "Transfer status" },
  { member: "restoreStatus", term: "Restore status" },
  { member: "transferDir", term: "Direction" },
  { member: "gainingClientId", term: "Gaining client" },
  { member: "reqClientId", term: "Requested by" },
  { member: "requestDate", term: "Requested", time: true },
  { member: "actClientId", term: "Acting client" },
  { member: "actionDate", term: "Action date", time: true },
  { member: "reportDate", term: "Report accepted", time: true },
  { member: "reportDueDate", term: "Report due", time: true },
  { member: "expiryDate", term: "Expiry", time: true },
  { member: "period", term: "Period" },
  { member: "transferPeriod", term: "Transfer period" },
  { member: "renewalPeriod", term: "Renewal period" },
];

const KNOWN = new Set(["@type", "processId", ...MEMBERS.map((entry) => entry.member)]);

function kindOf(type: string, data: Record<string, unknown>): ProcessKind | undefined {
  const name = type.toLowerCase();
  for (const kind of ["transfer", "renew", "restore", "create"] as const) if (name.includes(kind)) return kind;
  if ("trStatus" in data) return "transfer";
  if ("restoreStatus" in data) return "restore";
  return undefined;
}

/** A process a message carries, by the members the draft defines; what it does not define is kept in `others`. */
export function processViewOf(process: unknown): ProcessView | undefined {
  if (!isJsonObject(process)) return undefined;
  const type = typeof process["@type"] === "string" ? process["@type"] : "";
  const fields: ProcessField[] = [];
  for (const { member, term, time } of MEMBERS) {
    const value = process[member];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "string") fields.push({ term, value, kind: time ? "time" : "code" });
    else fields.push({ term, value: JSON.stringify(value), kind: "code" });
  }
  return {
    type,
    kind: kindOf(type, process),
    id: typeof process.processId === "string" ? process.processId : "",
    fields,
    others: Object.entries(process).filter(([key]) => !KNOWN.has(key)),
  };
}
