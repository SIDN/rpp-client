import { t } from "@/i18n";
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
    <article aria-label={t("messages.details.ariaLabel", { id: view.id })} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-xl">
          <code>{view.id}</code>
        </h3>
        <Badge tone={view.known ? "neutral" : "warning"}>{view.typeLabel}</Badge>
        {synthetic && <Badge tone="warning">{t("messages.synthetic.example")}</Badge>}
      </header>

      {!view.known && (
        <Callout tone="warning" title={t("messages.warning.unknownType")}>
          {t("messages.warning.unknownTypeDescription", { type: view.type || "(none)" })}
        </Callout>
      )}

      <DefinitionList>
        <DefinitionRow term={t("messages.details.type")}>{view.type ? <code>{view.type}</code> : <Nothing>{t("messages.value.notGiven")}</Nothing>}</DefinitionRow>
        <DefinitionRow term={t("messages.details.status")}>{view.status ? <code>{view.status}</code> : <Nothing>{t("messages.value.notGiven")}</Nothing>}</DefinitionRow>
        <DefinitionRow term={t("messages.details.created")}>
          <Timestamp value={view.createdAt || undefined} />
        </DefinitionRow>
        <DefinitionRow term={t("messages.details.about")}>
          {view.objectId ? (
            <span>
              {view.objectType && <span className="text-muted-foreground">{view.objectType} </span>}
              <code>{view.objectId}</code>
            </span>
          ) : (
            <Nothing>{t("messages.value.notAboutObject")}</Nothing>
          )}
        </DefinitionRow>
        {view.fields.map((entry) => (
          <DefinitionRow key={entry.term} term={entry.term}>
            {entry.kind === "time" ? <Timestamp value={entry.value} /> : entry.kind === "code" ? <code>{entry.value}</code> : entry.value}
          </DefinitionRow>
        ))}
        {view.process !== undefined && processView === undefined && (
          <DefinitionRow term={t("messages.details.process")}>
            <code className="break-all text-xs">{JSON.stringify(view.process)}</code>
          </DefinitionRow>
        )}
        {view.others.length > 0 && (
          <DefinitionRow term={t("messages.details.otherMembers")}>
            <OtherMembers members={view.others} />
          </DefinitionRow>
        )}
      </DefinitionList>

      {processView && <MessageProcess process={processView} objectType={view.objectType} objectId={view.objectId} />}

      <div className="flex flex-col gap-2">
        <ConfirmAction
          trigger={t("messages.action.acknowledge")}
          title={t("messages.confirm.acknowledgeTitle", { id: view.id })}
          confirmLabel={t("messages.confirm.acknowledge", { id: view.id })}
          pending={pending}
          onConfirm={() => onAcknowledge(view.id)}
        >
          {synthetic
            ? t("messages.confirm.syntheticAcknowledge")
            : t("messages.confirm.acknowledgeDescription")}
        </ConfirmAction>
      </div>

      <JsonView label={t("messages.details.rawMessage", { id: view.id })} value={message} />
    </article>
  );
}
