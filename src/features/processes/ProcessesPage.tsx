import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { t } from "@/i18n";
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

const header = () => <PageHeader title={t("processes.page.title")} description={t("processes.page.description")} />;

const objectLabel = (type: string) => {
  switch (type) {
    case "domainName": return t("processes.object.domainNames");
    case "contact": return t("processes.object.contacts");
    case "host": return t("processes.object.hosts");
    default: return type;
  }
};
const kindLabel = (kind: string) => {
  switch (kind) {
    case "transfer": return t("processes.kind.transfer");
    case "renew": return t("processes.kind.renew");
    case "restore": return t("processes.kind.restore");
    case "create": return t("processes.kind.create");
    default: return kind;
  }
};

const processWord = (count: number) => count === 1 ? t("processes.summary.process.one") : t("processes.summary.process.other");
const objectCounts = (objects: number, processes: number) => {
  const params = { objects, processes, processWord: processWord(processes) };
  return objects === 1 ? t("processes.summary.counts.oneObject", params) : t("processes.summary.counts.otherObjects", params);
};
const noProcessesText = (count: number) => count === 1 ? t("processes.empty.noProcesses.one", { count }) : t("processes.empty.noProcesses.other", { count });

export function ProcessesPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();

  if (discovery.status === "not-started") {
    return (
      <>
        {header()}
        <NotConnected />
      </>
    );
  }
  if (discovery.status === "loading") {
    return (
      <>
        {header()}
        <Callout tone="info" title={t("processes.connection.readingCapabilities")} />
      </>
    );
  }
  if (!session) {
    return (
      <>
        {header()}
        <Callout tone="warning" title={discovery.status === "failed" ? t("processes.connection.capabilitiesFailed") : t("processes.connection.noConnection")}>
          {discovery.status === "failed" ? discovery.error.message : t("processes.connection.setUpFirst")}
        </Callout>
      </>
    );
  }
  return (
    <>
      {header()}
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
      return <span className="text-muted-foreground">{t("processes.status.reading")}</span>;
    case "failed":
      return (
        <span title={row.detail.message} className="text-danger-ink">
          {t("processes.status.couldNotRead")}
        </span>
      );
    case "unreadable":
      return <Nothing>{t("processes.status.cannotBeRead")}</Nothing>;
    case "ready":
      return <Nothing>{t("processes.status.none")}</Nothing>;
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
        <Field label={t("processes.filter.objectType")} className="w-48">
          {(control) => (
            <Select {...control} value={filter.objectType} onChange={(event) => change({ objectType: event.target.value as ProcessFilter["objectType"] })}>
              <option value={ANY}>{t("processes.filter.allObjects")}</option>
              {OBJECT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {objectLabel(type.id)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("processes.filter.processType")} className="w-48">
          {(control) => (
            <Select {...control} value={filter.kind} onChange={(event) => change({ kind: event.target.value as ProcessFilter["kind"] })}>
              <option value={ANY}>{t("processes.filter.allProcesses")}</option>
              {PROCESS_KINDS.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kindLabel(kind.id)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("processes.filter.status")} className="w-56">
          {(control) => (
            <Select {...control} value={filter.status} onChange={(event) => change({ status: event.target.value })}>
              <option value={ANY}>{t("processes.filter.anyStatus")}</option>
              <option value={ACTIVE}>{t("processes.filter.active")}</option>
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
              {t("processes.filter.clear")}
            </Button>
          )}
          <Button variant="secondary" disabled={objects.length === 0 || refreshing !== undefined} onClick={() => void refresh()}>
            <RefreshCw aria-hidden className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} />
            {t("processes.action.readAgain")}
          </Button>
        </div>
      </div>

      <p role="status" className="text-sm text-muted-foreground">
        {refreshing
          ? t("processes.summary.refreshing", { done: refreshing.done, total: refreshing.total, failure: refreshing.failed > 0 ? t("processes.summary.refreshFailures", { count: refreshing.failed }) : "" })
          : `${objectCounts(objects.length, rows.length)}${reading > 0 ? ` ${t("processes.summary.reading", { count: reading })}` : ""}${unread > 0 ? ` ${t("processes.summary.unread", { count: unread, max: MAX_READS })}` : ""}`}
      </p>

      {objects.length === 0 ? (
        <EmptyState title={t("processes.empty.noObjects.title")}>{t("processes.empty.noObjects.description")}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={t("processes.empty.noProcesses.title")}>{noProcessesText(objects.length)}</EmptyState>
      ) : matching.length === 0 ? (
        <EmptyState title={t("processes.empty.noMatch.title")}>{t("processes.empty.noMatch.description", { count: rows.length })}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("processes.table.caption")}</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t("processes.table.object")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("processes.table.process")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("processes.table.processId")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("processes.table.status")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("processes.table.requested")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("processes.table.registrars")}</th>
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
          <Field label={t("processes.pagination.resultsPerPage")} className="w-40">
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
            {t("processes.pagination.showing", { from: shown.from, to: shown.to, total: shown.total })}
          </p>
          <nav aria-label={t("processes.pagination.pages")} className="flex items-center gap-3">
            <Button variant="secondary" disabled={shown.page <= 1} onClick={() => setPage(shown.page - 1)}>
              {t("processes.pagination.previous")}
            </Button>
            <span className="text-sm">
              {t("processes.pagination.page", { page: shown.page, pages: shown.pages })}
            </span>
            <Button variant="secondary" disabled={shown.page >= shown.pages} onClick={() => setPage(shown.page + 1)}>
              {t("processes.pagination.next")}
            </Button>
          </nav>
        </div>
      )}
    </div>
  );
}
