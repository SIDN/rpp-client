import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { Badge } from "@/components/ui/badge";
import type { TransferProcess } from "@/rpp/core/types/objects";
import { t } from "@/i18n";

const isProcess = (data: unknown): data is TransferProcess =>
  typeof data === "object" && data !== null && typeof (data as { trStatus?: unknown }).trStatus === "string";

const statusTone = (status: string) => (status === "pending" ? "warning" : status.endsWith("Approved") ? "success" : "danger");

/** The transfer process the registry returned; an answer that is not one is shown as it came. */
export function TransferResult({ data }: { data: unknown }) {
  if (!isProcess(data)) {
    return (
      <pre tabIndex={0} aria-label={t("shared.transferResult.answer")} className="max-h-64 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }
  const code = (value: string | undefined) => (value ? <code>{value}</code> : <Nothing>{t("common.notGiven")}</Nothing>);
  return (
    <DefinitionList>
      <DefinitionRow term={t("shared.transferResult.status")}>
        <Badge tone={statusTone(data.trStatus)} dot>
          <code>{data.trStatus}</code>
        </Badge>
      </DefinitionRow>
      <DefinitionRow term={t("shared.transferResult.direction")}>{code(data.transferDir)}</DefinitionRow>
      <DefinitionRow term={t("shared.transferResult.requestedBy")}>{code(data.reqClientId)}</DefinitionRow>
      <DefinitionRow term={t("shared.transferResult.requested")}>{code(data.requestDate)}</DefinitionRow>
      <DefinitionRow term={t("shared.transferResult.actingRegistrar")}>{code(data.actClientId)}</DefinitionRow>
      <DefinitionRow term={t("shared.transferResult.actionDate")}>{code(data.actionDate)}</DefinitionRow>
      {"expiryDate" in data && <DefinitionRow term={t("shared.transferResult.expiryDate")}>{code(data.expiryDate)}</DefinitionRow>}
    </DefinitionList>
  );
}
