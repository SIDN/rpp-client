import { Plus, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "@/i18n";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { useSettings } from "@/app/settings-context";
import { valuesAt } from "@/application/search/evaluate";
import {
  buildQueryObject,
  dateOfTimestamp,
  emptyDraft,
  MAX_CONDITIONS,
  MAX_SORT_KEYS,
  newCondition,
  newSortKey,
  PAGE_SIZES,
  timestampOfDate,
  usesCalendar,
  withElement,
  withOperator,
  type ConditionDraft,
  type DraftProblem,
  type SearchDraft,
  type SortDraft,
} from "@/application/search/queryDraft";
import { searchObjects } from "@/application/search/searchWorkflow";
import { synthesizeSearchResults } from "@/application/search/synthesize";
import { Nothing } from "@/components/common/definition";
import { EmptyState, PageHeader, Section } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input, Select } from "@/components/ui/field";
import { formatDateTime } from "@/lib/dateTime";
import type { RppObject } from "@/rpp/core/types/objects";
import { validateQueryObject, type QueryObject, type QueryOperator } from "@/rpp/query/queryObject";
import {
  INCLUDABLE_ELEMENTS,
  operatorsOf,
  searchableElement,
  SEARCHABLE_ELEMENTS,
  SEARCHABLE_OBJECT_TYPES,
  type SearchableObjectType,
} from "@/rpp/query/searchable";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";

const header = () => <PageHeader title={t("search.page.title")} description={t("search.page.description")} />;

const typeLabel = (type: SearchableObjectType) => {
  switch (type) {
    case "domainName": return t("search.objectType.domainName");
    case "contact": return t("search.objectType.contact");
    case "host": return t("search.objectType.host");
    case "organisation": return t("search.objectType.organisation");
  }
};

const operatorLabel = (op: QueryOperator) => {
  switch (op) {
    case "eq": return t("search.operator.eq");
    case "ne": return t("search.operator.ne");
    case "in": return t("search.operator.in");
    case "pr": return t("search.operator.pr");
    case "lt": return t("search.operator.lt");
    case "le": return t("search.operator.le");
    case "gt": return t("search.operator.gt");
    case "ge": return t("search.operator.ge");
    case "sw": return t("search.operator.sw");
    case "co": return t("search.operator.co");
  }
};

const problemText = (problem: DraftProblem) => {
  switch (problem.kind) {
    case "unknown-element": return t("search.problem.unknownElement");
    case "unsupported-operator": return t("search.problem.unsupportedOperator");
    case "missing-value": return t("search.problem.missingValue");
    case "invalid-boolean": return t("search.problem.invalidBoolean");
    case "invalid-integer": return t("search.problem.invalidInteger");
    case "invalid-timestamp": return t("search.problem.invalidTimestamp");
    case "too-many-values": return t("search.problem.tooManyValues");
    case "invalid-limit": return t("search.problem.invalidLimit");
  }
};

export function SearchPage() {
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
        <Callout tone="info" title={t("search.connection.readingCapabilities")} />
      </>
    );
  }
  if (!session) {
    return (
      <>
        {header()}
        <Callout tone="warning" title={discovery.status === "failed" ? t("search.connection.capabilitiesFailed") : t("search.connection.noConnection")}>
          {discovery.status === "failed" ? discovery.error.message : t("search.connection.setUpFirst")}
        </Callout>
      </>
    );
  }
  return (
    <>
      {header()}
      <SearchForm />
    </>
  );
}

interface Submitted {
  objectType: SearchableObjectType;
  query: QueryObject;
  now: Date;
  /** The TLD of synthesized names: the first one the server advertises. */
  tld: string | undefined;
  /** Seed of the random identifier numbers of the synthesized results, new for each search. */
  seed: number;
}

function SearchForm() {
  const { session } = useConnection();
  const discovery = useDiscoveryState();
  const [draft, setDraft] = useState<SearchDraft>(() => emptyDraft("domainName"));
  const [showJson, setShowJson] = useState(false);
  const [submitted, setSubmitted] = useState<Submitted>();
  const { query, problems } = useMemo(() => buildQueryObject(draft), [draft]);
  const validation = useMemo(() => validateQueryObject(query), [query]);

  const search = useOperation((variables: Submitted, signal) => {
    if (!session) throw new Error("No session");
    return searchObjects(session.client, variables.objectType, variables.query, { signal });
  });

  const update = (next: Partial<SearchDraft>) => setDraft((current) => ({ ...current, ...next }));
  const updateCondition = (id: string, change: (condition: ConditionDraft) => ConditionDraft) =>
    setDraft((current) => ({ ...current, conditions: current.conditions.map((condition) => (condition.id === id ? change(condition) : condition)) }));
  const updateSort = (id: string, change: Partial<SortDraft>) =>
    setDraft((current) => ({ ...current, sort: current.sort.map((key) => (key.id === id ? { ...key, ...change } : key)) }));

  const submit = () => {
    if (problems.length > 0 || validation.status !== "valid") return;
    const tld = discovery.status === "ready" || discovery.status === "partial" ? discovery.snapshot.tlds[0] : undefined;
    const next = { objectType: draft.objectType, query, now: new Date(), tld, seed: Math.floor(Math.random() * 2 ** 32) };
    setSubmitted(next);
    search.start(next);
  };

  const includable = INCLUDABLE_ELEMENTS[draft.objectType];

  return (
    <div className="flex flex-col gap-8">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className={showJson ? "grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]" : "flex flex-col"}
      >
        <div className="flex min-w-0 flex-col gap-8">
          <Field label={t("search.objectType.label")} hint={t("search.objectType.hint")} className="max-w-xs">
            {(control) => (
              <Select
                {...control}
                value={draft.objectType}
                onChange={(event) => setDraft(emptyDraft(event.target.value as SearchableObjectType))}
              >
                {SEARCHABLE_OBJECT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {typeLabel(type)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Section id="search-conditions" title={t("search.conditions.title")} description={t("search.conditions.description")}>
            {draft.conditions.length > 1 && (
              <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
                <legend className="mb-2 text-sm font-medium">{t("search.combinator.legend")}</legend>
                <Choice type="radio" name="combinator" checked={draft.combinator === "and"} onChange={() => update({ combinator: "and" })} label={t("search.combinator.and")} />
                <Choice type="radio" name="combinator" checked={draft.combinator === "or"} onChange={() => update({ combinator: "or" })} label={t("search.combinator.or")} />
              </fieldset>
            )}
            {draft.conditions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("search.conditions.none")}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {draft.conditions.map((condition, index) => (
                  <ConditionRow
                    key={condition.id}
                    index={index}
                    objectType={draft.objectType}
                    condition={condition}
                    problem={problems.find((problem) => problem.conditionId === condition.id)}
                    onChange={(change) => updateCondition(condition.id, change)}
                    onRemove={() => update({ conditions: draft.conditions.filter((other) => other.id !== condition.id) })}
                  />
                ))}
              </ol>
            )}
            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled={draft.conditions.length >= MAX_CONDITIONS}
                onClick={() => update({ conditions: [...draft.conditions, newCondition(draft)] })}
              >
                <Plus aria-hidden />
                {t("search.conditions.add")}
              </Button>
            </div>
          </Section>

          <Section id="search-results-shape" title={t("search.shape.title")} description={t("search.shape.description")}>
            {draft.sort.length > 0 && (
              <ol className="flex flex-col gap-3">
                {draft.sort.map((key, index) => (
                  <li key={key.id} className="flex flex-wrap items-center gap-2">
                    <Select
                      aria-label={t("search.sort.elementLabel", { number: index + 1 })}
                      className="w-auto min-w-56 font-mono"
                      value={key.element}
                      onChange={(event) => updateSort(key.id, { element: event.target.value })}
                    >
                      <ElementOptions objectType={draft.objectType} />
                    </Select>
                    <Select
                      aria-label={t("search.sort.directionLabel", { number: index + 1 })}
                      className="w-auto"
                      value={key.direction}
                      onChange={(event) => updateSort(key.id, { direction: event.target.value as SortDraft["direction"] })}
                    >
                      <option value="asc">{t("search.sort.asc")}</option>
                      <option value="desc">{t("search.sort.desc")}</option>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("search.sort.remove", { number: index + 1 })}
                      onClick={() => update({ sort: draft.sort.filter((other) => other.id !== key.id) })}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex flex-col items-start gap-6">
              <Button
                variant="secondary"
                size="sm"
                disabled={draft.sort.length >= MAX_SORT_KEYS}
                onClick={() => update({ sort: [...draft.sort, newSortKey(draft)] })}
              >
                <Plus aria-hidden />
                {t("search.sort.add")}
              </Button>
              <Field label={t("search.limit.label")} className="w-48">
                {(control) => (
                  <Select {...control} value={draft.limit} onChange={(event) => update({ limit: event.target.value })}>
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={String(size)}>{size}</option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            {includable.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">{t("search.include.legend")}</legend>
                {includable.map((path) => (
                  <Choice
                    key={path}
                    type="checkbox"
                    checked={draft.includeElements.includes(path)}
                    onChange={(event) =>
                      update({
                        includeElements: event.target.checked
                          ? [...draft.includeElements, path]
                          : draft.includeElements.filter((other) => other !== path),
                      })
                    }
                    label={<code>{path}</code>}
                    hint={t("search.include.linkedHint")}
                  />
                ))}
              </fieldset>
            )}
          </Section>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
            <Choice type="checkbox" checked={showJson} onChange={(event) => setShowJson(event.target.checked)} label={t("search.json.toggle")} />
            <SubmitButton pending={search.pending} disabled={problems.length > 0 || validation.status !== "valid"}>
              {t("search.action.search")}
            </SubmitButton>
          </div>
        </div>

        {showJson && (
          <aside aria-labelledby="search-json-title" className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-6 xl:self-start">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="search-json-title" className="text-base">
                {t("search.json.title", { method: "QUERY" })}
              </h2>
              {validation.status === "valid" ? (
                <Badge tone="success" dot>{t("search.json.valid")}</Badge>
              ) : (
                <Badge tone="danger" dot>{t("search.json.invalid")}</Badge>
              )}
            </div>
            <pre aria-live="polite" className="max-h-[32rem] overflow-auto rounded-md border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
              {JSON.stringify(query, null, 2)}
            </pre>
            {validation.status === "invalid" && (
              <ul className="list-disc pl-5 text-sm text-danger-ink">
                {validation.issues.map((issue, index) => (
                  <li key={index}>
                    <code>{issue.instancePath || "/"}</code> {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {problems.length > 0 && <p className="text-sm text-muted-foreground">{t("search.json.incomplete", { count: problems.length })}</p>}
          </aside>
        )}
      </form>

      <OperationOutcome operation={search} success={t("search.outcome.answered", { count: search.result?.data.results.length ?? 0 })} />

      {submitted && !search.pending && !search.cancelled && (search.result || search.failure) && (
        <SyntheticResults submitted={submitted} />
      )}
    </div>
  );
}

function ElementOptions({ objectType }: { objectType: SearchableObjectType }) {
  const elements = SEARCHABLE_ELEMENTS[objectType];
  return (
    <>
      <optgroup label={t("search.element.required")}>
        {elements.filter((element) => element.level === "must").map((element) => (
          <option key={element.path} value={element.path}>{element.path}</option>
        ))}
      </optgroup>
      <optgroup label={t("search.element.optional")}>
        {elements.filter((element) => element.level === "may").map((element) => (
          <option key={element.path} value={element.path}>{element.path}</option>
        ))}
      </optgroup>
    </>
  );
}

function ConditionRow({
  index,
  objectType,
  condition,
  problem,
  onChange,
  onRemove,
}: {
  index: number;
  objectType: SearchableObjectType;
  condition: ConditionDraft;
  problem: DraftProblem | undefined;
  onChange: (change: (condition: ConditionDraft) => ConditionDraft) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const element = searchableElement(objectType, condition.element);
  const operators = element ? operatorsOf(element) : [];
  const number = index + 1;
  const errorId = `${id}-error`;
  const valueProps = {
    "aria-label": t("search.condition.valueLabel", { number }),
    "aria-invalid": problem ? (true as const) : undefined,
    "aria-describedby": problem ? errorId : undefined,
  };

  let value;
  if (condition.op === "pr") {
    value = <span className="px-1 text-sm text-muted-foreground">{t("search.condition.noValue")}</span>;
  } else if (usesCalendar(element, condition.op)) {
    value = (
      <span className="flex items-center gap-2">
        <Input
          {...valueProps}
          type="date"
          className="w-auto"
          value={dateOfTimestamp(condition.value)}
          onChange={(event) => {
            const timestamp = timestampOfDate(event.target.value);
            onChange((current) => ({ ...current, value: timestamp }));
          }}
        />
        <span className="text-sm text-muted-foreground">{t("search.condition.dateStart")}</span>
      </span>
    );
  } else if (element?.type === "boolean" && condition.op !== "in") {
    value = (
      <Select {...valueProps} className="w-auto" value={condition.value} onChange={(event) => onChange((current) => ({ ...current, value: event.target.value }))}>
        <option value="true">true</option>
        <option value="false">false</option>
      </Select>
    );
  } else {
    const placeholder =
      condition.op === "in"
        ? t("search.condition.listPlaceholder")
        : undefined;
    value = (
      <>
        <Input
          {...valueProps}
          className="min-w-48 flex-1"
          list={element?.suggestions ? `${id}-suggestions` : undefined}
          placeholder={placeholder}
          value={condition.value}
          onChange={(event) => onChange((current) => ({ ...current, value: event.target.value }))}
        />
        {element?.suggestions && (
          <datalist id={`${id}-suggestions`}>
            {element.suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        )}
      </>
    );
  }

  return (
    <li className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-10 items-center gap-2 pr-1 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={condition.negate}
            onChange={(event) => onChange((current) => ({ ...current, negate: event.target.checked }))}
            aria-label={t("search.condition.notLabel", { number })}
          />
          <span aria-hidden>{t("search.condition.not")}</span>
        </label>
        <Select
          aria-label={t("search.condition.elementLabel", { number })}
          className="w-auto min-w-56 font-mono"
          value={condition.element}
          onChange={(event) => onChange((current) => withElement(current, objectType, event.target.value))}
        >
          <ElementOptions objectType={objectType} />
        </Select>
        <Select
          aria-label={t("search.condition.operatorLabel", { number })}
          className="w-auto"
          value={condition.op}
          onChange={(event) => {
            const op = event.target.value as QueryOperator;
            onChange((current) => withOperator(current, objectType, op));
          }}
        >
          {operators.map((op) => (
            <option key={op} value={op}>
              {operatorLabel(op)} ({op})
            </option>
          ))}
        </Select>
        {value}
        <Button variant="ghost" size="icon" className="ml-auto" aria-label={t("search.condition.remove", { number })} onClick={onRemove}>
          <X aria-hidden />
        </Button>
      </div>
      {problem && (
        <p id={errorId} className="text-sm font-medium text-danger-ink">
          {problemText(problem)}
        </p>
      )}
    </li>
  );
}

interface Column {
  header: string;
  /** Element path whose values are shown. */
  path: string;
  kind?: "code" | "date" | "status" | "info-link";
}

/** The screen that shows the info of an object of the type. */
const INFO_SCREENS: Record<SearchableObjectType, string> = {
  domainName: "/domains",
  contact: "/contacts",
  host: "/hosts",
  organisation: "/organisations",
};

const infoLink = (type: SearchableObjectType, identifier: string) =>
  `${INFO_SCREENS[type]}?name=${encodeURIComponent(identifier)}&tab=info&run=1`;

const columnsOf = (type: SearchableObjectType, includeElements: readonly string[]): Column[] => {
  const linked: Column[] = includeElements.includes("linked") ? [{ header: "linked", path: "linked", kind: "code" }] : [];
  const status: Column = { header: t("search.results.status"), path: "status.label", kind: "status" };
  const created: Column = { header: t("search.results.created"), path: "provMetadata.crDate", kind: "date" };
  switch (type) {
    case "domainName":
      return [{ header: t("search.results.name"), path: "name", kind: "info-link" }, status, { header: t("search.results.expires"), path: "expiryDate", kind: "date" }, created];
    case "contact":
      return [{ header: t("search.results.id"), path: "id", kind: "info-link" }, status, created];
    case "host":
      return [
        { header: t("search.results.hostName"), path: "hostName", kind: "info-link" },
        { header: t("search.results.addresses"), path: "dns.records.rdata.address", kind: "code" },
        status,
        ...linked,
        created,
      ];
    case "organisation":
      return [{ header: t("search.results.id"), path: "id", kind: "info-link" }, { header: t("search.results.parent"), path: "parent.id", kind: "code" }, status, created];
  }
};

function Cell({ objectType, object, column }: { objectType: SearchableObjectType; object: RppObject; column: Column }) {
  const { settings } = useSettings();
  const values = valuesAt(object, column.path);
  if (values.length === 0) return <Nothing>–</Nothing>;
  if (column.kind === "status") {
    return (
      <span className="flex flex-wrap gap-1">
        {values.map((value, index) => (
          <Badge key={index} tone="neutral"><code>{String(value)}</code></Badge>
        ))}
      </span>
    );
  }
  if (column.kind === "info-link") {
    const identifier = String(values[0]);
    return (
      <Link to={infoLink(objectType, identifier)} title={t("search.results.openInfo", { id: identifier })} className="break-all font-mono text-foreground underline decoration-primary decoration-2 underline-offset-4 hover:decoration-accent">
        {identifier}
      </Link>
    );
  }
  if (column.kind === "date") {
    const value = String(values[0]);
    return Number.isNaN(Date.parse(value)) ? <code>{value}</code> : <time dateTime={value} title={value}>{formatDateTime(value, settings.timeDisplay)}</time>;
  }
  const text = values.map(String).join(", ");
  return column.kind === "code" ? <code className="break-all">{text}</code> : <span>{text}</span>;
}

function SyntheticResults({ submitted }: { submitted: Submitted }) {
  const { objectType, query, now, tld, seed } = submitted;
  const results = useMemo(() => synthesizeSearchResults(objectType, query, { now, tld, seed }), [objectType, query, now, tld, seed]);
  const columns = columnsOf(objectType, query.includeElements ?? []);

  return (
    <Section id="search-synthetic" title={t("search.results.title", { type: typeLabel(objectType) })}>
      <Callout tone="warning" title={t("search.results.syntheticTitle")}>
        {t("search.results.syntheticDescription")}
      </Callout>
      <p role="status" className="text-sm text-muted-foreground">
        {t("search.results.summary", { shown: results.results.length, total: results.total ?? results.results.length })}
        {results.nextCursor !== undefined && <> {t("search.results.more")} <code>{results.nextCursor}</code></>}
      </p>
      {results.results.length === 0 ? (
        <EmptyState title={t("search.results.emptyTitle")}>{t("search.results.emptyDescription")}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("search.results.caption", { type: typeLabel(objectType) })}</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                {columns.map((column) => (
                  <th key={column.path} scope="col" className="px-3 py-2 font-medium">{column.header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.results.map((object, index) => (
                <tr key={index} className="align-top">
                  {columns.map((column) => (
                    <td key={column.path} className="px-3 py-2">
                      <Cell objectType={objectType} object={object} column={column} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
