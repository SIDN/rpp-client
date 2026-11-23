import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { Badge } from "@/components/ui/badge";
import type { TransferProcess } from "@/rpp/core/types/objects";

const isProcess = (data: unknown): data is TransferProcess =>
  typeof data === "object" && data !== null && typeof (data as { trStatus?: unknown }).trStatus === "string";

const statusTone = (status: string) => (status === "pending" ? "warning" : status.endsWith("Approved") ? "success" : "danger");

/** The transfer process the registry returned; an answer that is not one is shown as it came. */
export function TransferResult({ data }: { data: unknown }) {
  if (!isProcess(data)) {
    return (
      <pre tabIndex={0} aria-label="Answer of the registry" className="max-h-64 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }
  const code = (value: string | undefined) => (value ? <code>{value}</code> : <Nothing>Not given</Nothing>);
  return (
    <DefinitionList>
      <DefinitionRow term="Transfer status">
        <Badge tone={statusTone(data.trStatus)} dot>
          <code>{data.trStatus}</code>
        </Badge>
      </DefinitionRow>
      <DefinitionRow term="Direction">{code(data.transferDir)}</DefinitionRow>
      <DefinitionRow term="Requested by">{code(data.reqClientId)}</DefinitionRow>
      <DefinitionRow term="Requested">{code(data.requestDate)}</DefinitionRow>
      <DefinitionRow term="Acting registrar">{code(data.actClientId)}</DefinitionRow>
      <DefinitionRow term="Action date">{code(data.actionDate)}</DefinitionRow>
      {"expiryDate" in data && <DefinitionRow term="Expires after transfer">{code(data.expiryDate)}</DefinitionRow>}
    </DefinitionList>
  );
}
