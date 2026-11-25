import { useMemo, useState } from "react";
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

const header = <PageHeader title="Messages" description="Read the messages in the queue of the server, and acknowledge them." />;

export function MessagesPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const { settings } = useSettings();
  const support = objectSupport(discovery, "message");

  // Synthesized messages need no server, so they need no connection either.
  if (settings.synthesizeData) {
    return (
      <>
        {header}
        <Workspace key="synthetic" synthetic />
      </>
    );
  }

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
  if (support !== "offered" || !session) {
    return (
      <>
        {header}
        <Callout tone="warning" title={discovery.status === "failed" ? "The capabilities of the server could not be read" : support !== "offered" ? "This server does not offer messages" : "There is no connection"}>
          {discovery.status === "failed"
            ? discovery.error.message
            : support !== "offered"
              ? "Its discovery document does not list message. Nothing on this screen can work against it."
              : "Set up a connection first."}
        </Callout>
      </>
    );
  }
  return (
    <>
      {header}
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
      if (!workflows) throw new Error("Retrieving messages needs a connection");
      return workflows.retrieve(variables.type === ALL_TYPES ? [] : [variables.type], { signal });
    },
    (result, variables) => take(asMessages(result.data), variables.type),
  );
  const acknowledge = useOperation(
    (id: string, signal) => {
      if (!workflows) throw new Error("Acknowledging a message needs a connection");
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
        <Callout tone="warning" title="Synthesized data">
          These messages are made up by this client, two of each type. Nothing is requested from the server, and acknowledging only removes one from this list. Turn it
          off under <Link to="/developer/settings" className="underline">Settings</Link>.
        </Callout>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          show();
        }}
        className="flex flex-wrap items-end gap-x-4 gap-y-3"
      >
        <Field label="Message type" className="w-64">
          {(control) => (
            <Select {...control} value={type} onChange={(event) => setType(event.target.value)}>
              <option value={ALL_TYPES}>All types</option>
              {options.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Show at most" className="w-40">
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
        <SubmitButton pending={retrieve.pending}>Show messages</SubmitButton>
      </form>
      {!synthetic && (
        <p className="max-w-[62ch] text-sm text-muted-foreground">
          Retrieving messages marks them as delivered. A message stays in the queue until you acknowledge it, and is delivered again if you do not.
        </p>
      )}

      <OperationOutcome operation={retrieve} success={`Retrieved ${retrieve.result?.data.length ?? 0} message(s)`} />
      <OperationOutcome operation={acknowledge} success={`Acknowledged ${acknowledge.variables ?? "the message"}`} />
      {removed && (
        <Callout tone="success" title={`Removed ${removed} from the list`}>
          It was a synthesized example: nothing was sent to the server.
        </Callout>
      )}
      {strays > 0 && (
        <Callout tone="warning" title="The server returned other types as well">
          {strays} of the messages are not of the type {typeLabel(applied)}. They are shown too.
        </Callout>
      )}

      {!retrieved ? (
        <Callout tone="info" title="No messages retrieved yet">
          Choose a type, or all of them, and press Show messages.
        </Callout>
      ) : messages.length === 0 ? (
        <EmptyState title="No messages">The queue holds no messages{applied !== ALL_TYPES && <> of the type {typeLabel(applied)}</>}.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm text-muted-foreground">
            Showing {shown.length} of {messages.length} message(s){messages.length > shown.length ? ". Raise the limit to see more." : "."}
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Messages</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Message</th>
                  <th scope="col" className="px-3 py-2 font-medium">Type</th>
                  <th scope="col" className="px-3 py-2 font-medium">About</th>
                  <th scope="col" className="px-3 py-2 font-medium">Created</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Summary</th>
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
                          aria-label={`Details of ${view.id}`}
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
                            Synthesized
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
