import { isSynthetic } from "@/application/messages/synthesize";
import { viewOf } from "@/application/messages/messages";
import { processViewOf } from "@/application/messages/process";
import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import type { Message } from "@/rpp/core/types/objects";
import { ConfirmAction } from "../shared/ConfirmAction";
import { JsonView, OtherMembers, Timestamp } from "../shared/objectParts";
import { MessageProcess } from "./MessageProcess";

/** Everything the server sent of a message, by the fields of its type; what this client does not know is shown as received. */
export function MessageDetails({
  message,
  pending,
  onAcknowledge,
}: {
  message: Message;
  pending: boolean;
  onAcknowledge(id: string): void;
}) {
  const view = viewOf(message);
  const processView = processViewOf(view.process);
  const synthetic = isSynthetic(message);

  return (
    <article aria-label={`Message ${view.id}`} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-xl">
          <code>{view.id}</code>
        </h3>
        <Badge tone={view.known ? "neutral" : "warning"}>{view.typeLabel}</Badge>
        {synthetic && <Badge tone="warning">Synthesized example</Badge>}
      </header>

      {!view.known && (
        <Callout tone="warning" title="This client does not know this message type">
          The draft does not define <code>{view.type || "(none)"}</code>, or this client has no view for it. All of it is shown as received.
        </Callout>
      )}

      <DefinitionList>
        <DefinitionRow term="Type">{view.type ? <code>{view.type}</code> : <Nothing>Not given</Nothing>}</DefinitionRow>
        <DefinitionRow term="Status">{view.status ? <code>{view.status}</code> : <Nothing>Not given</Nothing>}</DefinitionRow>
        <DefinitionRow term="Created">
          <Timestamp value={view.createdAt || undefined} />
        </DefinitionRow>
        <DefinitionRow term="About">
          {view.objectId ? (
            <span>
              {view.objectType && <span className="text-muted-foreground">{view.objectType} </span>}
              <code>{view.objectId}</code>
            </span>
          ) : (
            <Nothing>Not about a specific object</Nothing>
          )}
        </DefinitionRow>
        {view.fields.map((entry) => (
          <DefinitionRow key={entry.term} term={entry.term}>
            {entry.kind === "time" ? <Timestamp value={entry.value} /> : entry.kind === "code" ? <code>{entry.value}</code> : entry.value}
          </DefinitionRow>
        ))}
        {view.process !== undefined && processView === undefined && (
          <DefinitionRow term="Process">
            <code className="break-all text-xs">{JSON.stringify(view.process)}</code>
          </DefinitionRow>
        )}
        {view.others.length > 0 && (
          <DefinitionRow term="Other members">
            <OtherMembers members={view.others} />
          </DefinitionRow>
        )}
      </DefinitionList>

      {processView && <MessageProcess process={processView} objectType={view.objectType} objectId={view.objectId} />}

      <div className="flex flex-col gap-2">
        <ConfirmAction
          trigger="Acknowledge message"
          title={`Acknowledge ${view.id}?`}
          confirmLabel={`Acknowledge ${view.id}`}
          pending={pending}
          onConfirm={() => onAcknowledge(view.id)}
        >
          {synthetic
            ? "This message is a synthesized example: it is only removed from this list, and nothing is sent to the server."
            : "The server removes the message from your queue and does not deliver it again. Until you do, it is delivered again."}
        </ConfirmAction>
      </div>

      <JsonView label={`Message ${view.id} as received`} value={message} />
    </article>
  );
}
