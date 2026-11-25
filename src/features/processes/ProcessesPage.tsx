import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { useSettings } from "@/app/settings-context";
import { formatDateTime } from "@/lib/dateTime";
import {
  ACTIVE,
  ANY,
  DEFAULT_PAGE_SIZE,
  filterRows,
  isActive,
  NO_FILTER,
  OBJECT_TYPES,
  PAGE_SIZES,
  pageOf,
  PROCESS_KINDS,
  processRefsOf,
  readObject,
  refKey,
  rowOf,
  sortRows,
  statusOptions,
  type ProcessFilter,
  type ProcessRow,
} from "@/application/processes/processList";
import { Nothing } from "@/components/common/definition";
import { EmptyState, PageHeader } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Select } from "@/components/ui/field";
import { seenKey } from "../shared/seenObjects";
import { MAX_READS, useProcessDetails, useSeenObjects } from "./processHooks";

const header = (
  <PageHeader
    title="Processes"
    description="Manage active and completed object processes."
  />
);

const objectLabel = (type: string) => OBJECT_TYPES.find((entry) => entry.id === type)?.label ?? type;
const kindLabel = (kind: string) => PROCESS_KINDS.find((entry) => entry.id === kind)?.label ?? kind;

export function ProcessesPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();

  if (discovery.status === "not-started") {
    return (
      <>
        {header}
        <NotConnected />
      </>
    );
  }
  if (discovery.status === "loading") {
    return (
      <>
        {header}
        <Callout tone="info" title="Reading the capabilities of the server" />
      </>
    );
  }
  if (!session) {
    return (
      <>
        {header}
        <Callout tone="warning" title={discovery.status === "failed" ? "The capabilities of the server could not be read" : "There is no connection"}>
          {discovery.status === "failed" ? discovery.error.message : "Set up a connection first."}
        </Callout>
      </>
    );
  }
  return (
    <>
      {header}
      <ProcessList />
    </>
  );
}

function StatusCell({ row }: { row: ProcessRow }) {
  if (row.status !== undefined) {
    const tone = isActive(row.kind, row.status) ? "warning" : row.status.endsWith("Approved") || row.status === "restored" ? "success" : "danger";
    return (
      <Badge tone={tone} dot>
        <code>{row.status}</code>
      </Badge>
    );
  }
  switch (row.detail.state) {
    case "loading":
      return <span className="text-muted-foreground">Reading…</span>;
    case "failed":
      return (
        <span title={row.detail.message} className="text-danger-ink">
          Could not be read
        </span>
      );
    case "unreadable":
      return <Nothing>Cannot be read</Nothing>;
    case "ready":
      return <Nothing>No status</Nothing>;
  }
}

function Requested({ value }: { value: string | undefined }) {
  const { settings } = useSettings();
  if (value === undefined) return <Nothing>–</Nothing>;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? <code>{value}</code> : <time dateTime={value} title={value}>{formatDateTime(value, settings.timeDisplay)}</time>;
}

function ProcessList() {
  const { session } = useConnection();
  const queryClient = useQueryClient();
  const objects = useSeenObjects();
  const refs = processRefsOf(objects);
  const { details, unread } = useProcessDetails(refs);
  const rows = sortRows(refs.map((ref) => rowOf(ref, details.get(refKey(ref)) ?? { state: "unreadable" })));

  const [filter, setFilter] = useState<ProcessFilter>(NO_FILTER);
  const { settings } = useSettings();
  const [pageSize, setPageSize] = useState<number>(() => ((PAGE_SIZES as readonly number[]).includes(settings.processPageSize) ? settings.processPageSize : DEFAULT_PAGE_SIZE));
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState<{ done: number; total: number; failed: number }>();

  const matching = filterRows(rows, filter);
  const shown = pageOf(matching, page, pageSize);
  const reading = rows.filter((row) => row.detail.state === "loading").length;
  const filtered = filter.objectType !== ANY || filter.kind !== ANY || filter.status !== ANY;

  const change = (next: Partial<ProcessFilter>) => {
    setFilter((current) => {
      const merged = { ...current, ...next };
      // A status that the new kind does not have would match nothing.
      const valid = merged.status === ANY || merged.status === ACTIVE || statusOptions(rows, merged.kind).includes(merged.status);
      return valid ? merged : { ...merged, status: ANY };
    });
    setPage(1);
  };

  const refresh = async () => {
    if (!session || refreshing) return;
    const total = objects.length;
    let failed = 0;
    setRefreshing({ done: 0, total, failed });
    for (const [index, object] of objects.entries()) {
      try {
        const data = await readObject(session.client, object.type, object.id);
        if (data !== undefined) queryClient.setQueryData(seenKey(object.type, session.id, object.id), data);
      } catch {
        failed += 1;
      }
      setRefreshing({ done: index + 1, total, failed });
    }
    await queryClient.invalidateQueries({ queryKey: ["process", session.id] });
    setRefreshing(undefined);
  };

  return (
    <div className="flex flex-col gap-6">

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="Object type" className="w-48">
          {(control) => (
            <Select {...control} value={filter.objectType} onChange={(event) => change({ objectType: event.target.value as ProcessFilter["objectType"] })}>
              <option value={ANY}>All objects</option>
              {OBJECT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Process type" className="w-48">
          {(control) => (
            <Select {...control} value={filter.kind} onChange={(event) => change({ kind: event.target.value as ProcessFilter["kind"] })}>
              <option value={ANY}>All processes</option>
              {PROCESS_KINDS.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Status" className="w-56">
          {(control) => (
            <Select {...control} value={filter.status} onChange={(event) => change({ status: event.target.value })}>
              <option value={ANY}>Any status</option>
              <option value={ACTIVE}>Active (not ended)</option>
              {statusOptions(rows, filter.kind).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex gap-2">
          {filtered && (
            <Button variant="ghost" onClick={() => change({ ...NO_FILTER })}>
              Clear filters
            </Button>
          )}
          <Button variant="secondary" disabled={objects.length === 0 || refreshing !== undefined} onClick={() => void refresh()}>
            <RefreshCw aria-hidden className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} />
            Read again
          </Button>
        </div>
      </div>

      <p role="status" className="text-sm text-muted-foreground">
        {refreshing
          ? `Reading the objects again: ${refreshing.done} of ${refreshing.total}${refreshing.failed > 0 ? `, ${refreshing.failed} could not be read` : ""}.`
          : `${objects.length} ${objects.length === 1 ? "object" : "objects"} seen, ${rows.length} ${rows.length === 1 ? "process" : "processes"}.${reading > 0 ? ` Reading the status of ${reading}.` : ""}${unread > 0 ? ` The status of ${unread} is not read: the most read at once is ${MAX_READS}.` : ""}`}
      </p>

      {objects.length === 0 ? (
        <EmptyState title="No objects seen yet">Get the info of, create or change a domain name, contact or host, and its processes appear here.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="These objects have no processes">The {objects.length === 1 ? "object" : "objects"} you have worked with name no transfer, renewal, restore or creation.</EmptyState>
      ) : matching.length === 0 ? (
        <EmptyState title="No process matches">
          None of the {rows.length} processes has this object type, process type and status together.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Processes of the objects seen in this session</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Object</th>
                <th scope="col" className="px-3 py-2 font-medium">Process</th>
                <th scope="col" className="px-3 py-2 font-medium">Process id</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Requested</th>
                <th scope="col" className="px-3 py-2 font-medium">Registrars</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.items.map((row) => (
                <tr key={refKey(row)} className="align-top">
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <code className="break-all">{row.objectId}</code>
                      <span className="text-xs text-muted-foreground">{objectLabel(row.objectType)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">{kindLabel(row.kind)}</td>
                  <td className="px-3 py-2">
                    <code className="break-all">{row.processId}</code>
                  </td>
                  <td className="px-3 py-2">
                    <StatusCell row={row} />
                  </td>
                  <td className="px-3 py-2">
                    <Requested value={row.requested} />
                  </td>
                  <td className="px-3 py-2">{row.parties ? <code>{row.parties}</code> : <Nothing>–</Nothing>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matching.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <Field label="Results per page" className="w-40">
            {(control) => (
              <Select
                {...control}
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <p role="status" className="pb-2 text-sm">
            Showing {shown.from}–{shown.to} of {shown.total}
          </p>
          <nav aria-label="Pages" className="flex items-center gap-3">
            <Button variant="secondary" disabled={shown.page <= 1} onClick={() => setPage(shown.page - 1)}>
              Previous
            </Button>
            <span className="text-sm">
              Page {shown.page} of {shown.pages}
            </span>
            <Button variant="secondary" disabled={shown.page >= shown.pages} onClick={() => setPage(shown.page + 1)}>
              Next
            </Button>
          </nav>
        </div>
      )}
    </div>
  );
}
