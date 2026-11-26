import { t } from "@/i18n";
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
const MEMBERS: readonly { member: string; termKey: string; time?: boolean }[] = [
  { member: "trStatus", termKey: "messages.processField.0" },
  { member: "restoreStatus", termKey: "messages.processField.1" },
  { member: "transferDir", termKey: "messages.processField.2" },
  { member: "gainingClientId", termKey: "messages.processField.3" },
  { member: "reqClientId", termKey: "messages.processField.4" },
  { member: "requestDate", termKey: "messages.processField.5", time: true },
  { member: "actClientId", termKey: "messages.processField.6" },
  { member: "actionDate", termKey: "messages.processField.7", time: true },
  { member: "reportDate", termKey: "messages.processField.8", time: true },
  { member: "reportDueDate", termKey: "messages.processField.9", time: true },
  { member: "expiryDate", termKey: "messages.processField.10", time: true },
  { member: "period", termKey: "messages.processField.11" },
  { member: "transferPeriod", termKey: "messages.processField.12" },
  { member: "renewalPeriod", termKey: "messages.processField.13" },
];


function termText(key: string): string {
  switch (key) {
    case "messages.processField.0": return t("messages.processField.0");
    case "messages.processField.1": return t("messages.processField.1");
    case "messages.processField.2": return t("messages.processField.2");
    case "messages.processField.3": return t("messages.processField.3");
    case "messages.processField.4": return t("messages.processField.4");
    case "messages.processField.5": return t("messages.processField.5");
    case "messages.processField.6": return t("messages.processField.6");
    case "messages.processField.7": return t("messages.processField.7");
    case "messages.processField.8": return t("messages.processField.8");
    case "messages.processField.9": return t("messages.processField.9");
    case "messages.processField.10": return t("messages.processField.10");
    case "messages.processField.11": return t("messages.processField.11");
    case "messages.processField.12": return t("messages.processField.12");
    default: return t("messages.processField.13");
  }
}

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
  for (const { member, termKey, time } of MEMBERS) {
    const value = process[member];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "string") fields.push({ term: termText(termKey), value, kind: time ? "time" : "code" });
    else fields.push({ term: termText(termKey), value: JSON.stringify(value), kind: "code" });
  }
  return {
    type,
    kind: kindOf(type, process),
    id: typeof process.processId === "string" ? process.processId : "",
    fields,
    others: Object.entries(process).filter(([key]) => !KNOWN.has(key)),
  };
}
