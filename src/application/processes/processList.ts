import { t } from "@/i18n";
import { ENUMERATIONS } from "@/rpp/core/status/statuses";
import { isJsonObject } from "@/rpp/core/types/json";
import type { ProcessKind } from "@/rpp/operations/definitions";
import type { RppClient } from "@/rpp/operations/RppClient";

export type ObjectType = "domainName" | "contact" | "host";

export const OBJECT_TYPES: readonly { id: ObjectType; labelKey: string }[] = [
  { id: "domainName", labelKey: "processes.object.domainNames" },
  { id: "contact", labelKey: "processes.object.contacts" },
  { id: "host", labelKey: "processes.object.hosts" },
];

/** `member` is the member of an object's `processes` that lists the processes of the kind. */
export const PROCESS_KINDS: readonly { id: ProcessKind; labelKey: string; member: string }[] = [
  { id: "transfer", labelKey: "processes.kind.transfer", member: "transferProcess" },
  { id: "renew", labelKey: "processes.kind.renew", member: "renewProcess" },
  { id: "restore", labelKey: "processes.kind.restore", member: "restoreProcess" },
  { id: "create", labelKey: "processes.kind.create", member: "createProcess" },
];

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** An object a screen has shown, with the members this list needs of it. */
export interface SeenObject {
  type: ObjectType;
  /** The name of a domain name or host, the identifier of a contact. */
  id: string;
  processes: unknown;
}

/** A process an object names in its `processes` member. Its status is not known until the process is read. */
export interface ProcessRef {
  objectType: ObjectType;
  objectId: string;
  kind: ProcessKind;
  processId: string;
}

export const refKey = (ref: ProcessRef) => `${ref.objectType}\n${ref.objectId}\n${ref.kind}\n${ref.processId}`;

/** The processes the objects name, in the order of the objects and of the lists in them. */
export function processRefsOf(objects: readonly SeenObject[]): ProcessRef[] {
  const refs: ProcessRef[] = [];
  for (const object of objects) {
    if (!isJsonObject(object.processes)) continue;
    for (const kind of PROCESS_KINDS) {
      const list = object.processes[kind.member];
      if (!Array.isArray(list)) continue;
      for (const entry of list as unknown[]) {
        if (isJsonObject(entry) && typeof entry.processId === "string" && entry.processId !== "") {
          refs.push({ objectType: object.type, objectId: object.id, kind: kind.id, processId: entry.processId });
        }
      }
    }
  }
  return refs;
}

const RESOURCE = { domainName: "domains", contact: "contacts", host: "hosts" } as const;

/** Whether the contract has a read for this kind of process; a renewal can be started and listed but not read. */
export const canReadProcess = (client: RppClient, ref: ProcessRef): boolean => client[RESOURCE[ref.objectType]].processes[ref.kind]?.supports("read") ?? false;

export async function readProcess(client: RppClient, ref: ProcessRef, signal?: AbortSignal): Promise<unknown> {
  const operations = client[RESOURCE[ref.objectType]].processes[ref.kind];
  if (!operations?.supports("read")) throw new Error(t("processes.error.noReadOperation", { kind: ref.kind, objectType: ref.objectType }));
  return (await operations.read(ref.objectId, { processId: ref.processId }, { signal })).data;
}

export async function readObject(client: RppClient, type: ObjectType, id: string, signal?: AbortSignal): Promise<unknown> {
  return (await client[RESOURCE[type]].read(id, { signal })).data;
}

/** Where the details of a process stand. */
export type ProcessDetail = { state: "loading" } | { state: "failed"; message: string } | { state: "ready"; process: unknown } | { state: "unreadable" };

export interface ProcessRow extends ProcessRef {
  detail: ProcessDetail;
  /** `trStatus` of a transfer, `restoreStatus` of a restore; renewals and creations have none. */
  status: string | undefined;
  /** The `requestDate` of the process, when it has one. */
  requested: string | undefined;
  /** Who asked and who acts, for a transfer. */
  parties: string | undefined;
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

export function rowOf(ref: ProcessRef, detail: ProcessDetail): ProcessRow {
  const process = detail.state === "ready" && isJsonObject(detail.process) ? detail.process : {};
  const status = ref.kind === "transfer" ? text(process.trStatus) : ref.kind === "restore" ? text(process.restoreStatus) : undefined;
  const from = text(process.reqClientId);
  const to = text(process.actClientId);
  return { ...ref, detail, status, requested: text(process.requestDate), parties: ref.kind === "transfer" && (from || to) ? `${from ?? "?"} → ${to ?? "?"}` : undefined };
}

/** What a process is in while it has not ended: a transfer that is pending, a restore that is pending. */
export const ACTIVE_STATUSES: Readonly<Partial<Record<ProcessKind, readonly string[]>>> = { transfer: ["pending"], restore: ["pendingRestore"] };

export const isActive = (kind: ProcessKind, status: string | undefined): boolean => status !== undefined && (ACTIVE_STATUSES[kind] ?? []).includes(status);

export const ANY = "all";
export const ACTIVE = "active";

export interface ProcessFilter {
  objectType: ObjectType | typeof ANY;
  kind: ProcessKind | typeof ANY;
  /** `all`, `active`, or one status value. */
  status: string;
}

export const NO_FILTER: ProcessFilter = { objectType: ANY, kind: ANY, status: ANY };

export function filterRows(rows: readonly ProcessRow[], filter: ProcessFilter): ProcessRow[] {
  return rows.filter((row) => {
    if (filter.objectType !== ANY && row.objectType !== filter.objectType) return false;
    if (filter.kind !== ANY && row.kind !== filter.kind) return false;
    if (filter.status === ANY) return true;
    return filter.status === ACTIVE ? isActive(row.kind, row.status) : row.status === filter.status;
  });
}

/** The newest request first; a process without a date follows, in the order it came. */
export function sortRows(rows: readonly ProcessRow[]): ProcessRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      if (a.row.requested !== undefined && b.row.requested !== undefined && a.row.requested !== b.row.requested) return a.row.requested < b.row.requested ? 1 : -1;
      if ((a.row.requested === undefined) !== (b.row.requested === undefined)) return a.row.requested === undefined ? 1 : -1;
      return a.index - b.index;
    })
    .map(({ row }) => row);
}

const KNOWN_STATUSES: Readonly<Partial<Record<ProcessKind, readonly string[]>>> = {
  transfer: ENUMERATIONS.transferStatus,
  restore: ENUMERATIONS.restoreStatus,
};

/** The values a status filter can take for the kind: those the draft lists, and any other the server has shown. */
export function statusOptions(rows: readonly ProcessRow[], kind: ProcessKind | typeof ANY): string[] {
  const kinds = kind === ANY ? (Object.keys(KNOWN_STATUSES) as ProcessKind[]) : [kind];
  const options = new Set(kinds.flatMap((entry) => KNOWN_STATUSES[entry] ?? []));
  for (const row of rows) if (row.status !== undefined && (kind === ANY || row.kind === kind)) options.add(row.status);
  return [...options];
}

export interface Page<T> {
  items: T[];
  /** 1-based, kept within the pages there are. */
  page: number;
  pages: number;
  /** 1-based position of the first and the last item shown, 0 when there are none. */
  from: number;
  to: number;
  total: number;
}

export function pageOf<T>(items: readonly T[], page: number, size: number): Page<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const shown = items.slice(start, start + size);
  return { items: shown, page: current, pages, from: shown.length === 0 ? 0 : start + 1, to: start + shown.length, total };
}
