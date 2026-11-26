import { useMemo, useState } from "react";
import { t } from "@/i18n";
import { Link } from "react-router-dom";
import { objectSupport } from "@/application/capability";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { useSettings } from "@/app/settings-context";
import {
  ALL_TYPES,
  asMessages,
  DEFAULT_MESSAGE_LIMIT,
  MESSAGE_LIMITS,
  MESSAGE_TYPES,
  messageTypeOf,
  otherTypesIn,
  typeLabel,
  viewOf,
} from "@/application/messages/messages";
import { createMessageWorkflows } from "@/application/messages/messageWorkflows";
import { isSynthetic, synthesizeMessages } from "@/application/messages/synthesize";
import { Nothing } from "@/components/common/definition";
import { EmptyState, PageHeader } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Field, Select } from "@/components/ui/field";
import type { Message } from "@/rpp/core/types/objects";
import { formatDateTime } from "@/lib/dateTime";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";
import { MessageDetails } from "./MessageDetails";

const header = () => <PageHeader title={t("messages.page.title")} description={t("messages.page.description")} />;

export function MessagesPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const { settings } = useSettings();
  const support = objectSupport(discovery, "message");

  // Synthesized messages need no server, so they need no connection either.
  if (settings.synthesizeData) {
    return (
      <>
        {header()}
        <Workspace key="synthetic" synthetic />
      </>
    );
  }

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
        <Callout tone="info" title={t("messages.connection.readingCapabilities")} />
      </>
    );
  }
  if (support !== "offered" || !session) {
    return (
      <>
        {header()}
        <Callout tone="warning" title={discovery.status === "failed" ? t("messages.connection.capabilitiesFailed") : support !== "offered" ? t("messages.connection.notOffered") : t("messages.connection.noConnection")}>
          {discovery.status === "failed"
            ? discovery.error.message
            : support !== "offered"
              ? t("messages.connection.discoveryNotListed")
              : t("messages.connection.setUpFirst")}
        </Callout>
      </>
    );
  }
  return (
    <>
      {header()}
      <Workspace key="live" synthetic={false} />
    </>
  );
}


function Workspace({ synthetic }: { synthetic: boolean }) {
  const { session } = useConnection();
  const { settings } = useSettings();
  const workflows = useMemo(() => (session ? createMessageWorkflows(session.client) : undefined), [session]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [retrieved, setRetrieved] = useState(false);
  const [type, setType] = useState(ALL_TYPES);
  const [applied, setApplied] = useState(ALL_TYPES);
  const [limit, setLimit] = useState<number>(() => ((MESSAGE_LIMITS as readonly number[]).includes(settings.messageLimit) ? settings.messageLimit : DEFAULT_MESSAGE_LIMIT));
  const [selected, setSelected] = useState<string>();
  const [removed, setRemoved] = useState<string>();

  const take = (list: Message[], forType: string) => {
    setMessages(list);
    setRetrieved(true);
    setApplied(forType);
    setSelected(undefined);
    setRemoved(undefined);
  };

  const retrieve = useOperation(
    (variables: { type: string }, signal) => {
      if (!workflows) throw new Error(t("messages.error.retrieveNeedsConnection"));
      return workflows.retrieve(variables.type === ALL_TYPES ? [] : [variables.type], { signal });
    },
    (result, variables) => take(asMessages(result.data), variables.type),
  );
  const acknowledge = useOperation(
    (id: string, signal) => {
      if (!workflows) throw new Error(t("messages.error.acknowledgeNeedsConnection"));
      return workflows.acknowledge(id, { signal });
    },
    (_result, id) => {
      setMessages((current) => current.filter((message) => message.id !== id));
      setSelected(undefined);
    },
  );

  const show = () => {
    if (synthetic) take(synthesizeMessages({ types: type === ALL_TYPES ? [] : [type] }), type);
    else retrieve.start({ type });
  };
  const acknowledgeMessage = (id: string) => {
    if (!synthetic) return acknowledge.start(id);
    setMessages((current) => current.filter((message) => message.id !== id));
    setSelected(undefined);
    setRemoved(id);
  };

  const options = [...MESSAGE_TYPES, ...otherTypesIn(messages).map((id) => ({ id, label: id }))];
  const shown = messages.slice(0, limit);
  const chosen = messages.find((message) => message.id === selected);
  const strays = applied === ALL_TYPES ? 0 : messages.filter((message) => messageTypeOf(message) !== applied).length;

  return (
    <div className="flex flex-col gap-6">
      {synthetic && (
        <Callout tone="warning" title={t("messages.synthetic.title")}>
          {t("messages.synthetic.descriptionBeforeSettings")} <Link to="/developer/settings" className="underline">{t("messages.synthetic.settings")}</Link>{t("messages.synthetic.descriptionAfterSettings")}
        </Callout>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          show();
        }}
        className="flex flex-wrap items-end gap-x-4 gap-y-3"
      >
        <Field label={t("messages.filter.type")} className="w-64">
          {(control) => (
            <Select {...control} value={type} onChange={(event) => setType(event.target.value)}>
              <option value={ALL_TYPES}>{t("messages.filter.allTypes")}</option>
              {options.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {typeLabel(entry.id)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("messages.filter.showAtMost")} className="w-40">
          {(control) => (
            <Select {...control} value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              {MESSAGE_LIMITS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <SubmitButton pending={retrieve.pending}>{t("messages.action.show")}</SubmitButton>
      </form>
      {!synthetic && (
        <p className="max-w-[62ch] text-sm text-muted-foreground">
          {t("messages.queue.behavior")}
        </p>
      )}

      <OperationOutcome operation={retrieve} success={t("messages.outcome.retrieved", { count: retrieve.result?.data.length ?? 0 })} />
      <OperationOutcome operation={acknowledge} success={t("messages.outcome.acknowledged", { id: acknowledge.variables ?? t("messages.noun.message") })} />
      {removed && (
        <Callout tone="success" title={t("messages.synthetic.removed", { id: removed })}>
          {t("messages.synthetic.removedDescription")}
        </Callout>
      )}
      {strays > 0 && (
        <Callout tone="warning" title={t("messages.warning.otherTypes")}>
          {t("messages.warning.otherTypesDescription", { count: strays, type: typeLabel(applied) })}
        </Callout>
      )}

      {!retrieved ? (
        <Callout tone="info" title={t("messages.empty.notRetrieved.title")}>
          {t("messages.empty.notRetrieved.description")}
        </Callout>
      ) : messages.length === 0 ? (
        <EmptyState title={t("messages.empty.none.title")}>{applied === ALL_TYPES ? t("messages.empty.none.all") : t("messages.empty.none.filtered", { type: typeLabel(applied) })}</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm text-muted-foreground">
            {messages.length > shown.length ? t("messages.list.showingMore", { shown: shown.length, total: messages.length }) : t("messages.list.showing", { shown: shown.length, total: messages.length })}
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("messages.table.caption")}</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">{t("messages.table.message")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("messages.table.type")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("messages.table.about")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("messages.table.created")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("messages.table.status")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("messages.table.summary")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((message) => {
                  const view = viewOf(message);
                  return (
                    <tr
                      key={view.id}
                      aria-selected={view.id === selected}
                      onClick={() => setSelected(view.id)}
                      className={`cursor-pointer align-top hover:bg-muted/40 ${view.id === selected ? "bg-muted/60" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          aria-label={t("messages.action.detailsOf", { id: view.id })}
                          aria-pressed={view.id === selected}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelected(view.id);
                          }}
                          className="font-mono underline-offset-2 hover:underline focus-visible:outline-accent"
                        >
                          {view.id}
                        </button>
                        {isSynthetic(message) && (
                          <Badge tone="warning" className="ml-2">
                            {t("messages.synthetic.badge")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={view.known ? "neutral" : "warning"}>{view.typeLabel}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {view.objectId ? (
                          <span className="flex flex-col">
                            <code className="break-all">{view.objectId}</code>
                            {view.objectType && <span className="text-xs text-muted-foreground">{view.objectType}</span>}
                          </span>
                        ) : (
                          <Nothing>–</Nothing>
                        )}
                      </td>
                      <td className="px-3 py-2">{view.createdAt ? <time dateTime={view.createdAt} title={view.createdAt}>{formatDateTime(view.createdAt, settings.timeDisplay)}</time> : <Nothing>–</Nothing>}</td>
                      <td className="px-3 py-2">{view.status ? <code>{view.status}</code> : <Nothing>–</Nothing>}</td>
                      <td className="px-3 py-2">{view.summary}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {chosen && <MessageDetails message={chosen} pending={acknowledge.pending} onAcknowledge={acknowledgeMessage} />}
    </div>
  );
}
