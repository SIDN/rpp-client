import { parseResultCode } from "@/rpp/core/status/resultCodes";
import { describeStatus, type StatusType } from "@/rpp/core/status/statuses";
import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n";

/** An RPP result code as received, with what core §18 says it means. The raw code is always shown. */
export function ResultCodeChip({ code, className }: { code: string; className?: string }) {
  const parsed = parseResultCode(code);
  const tone = !parsed.wellFormed ? "warning" : parsed.outcome === "success" ? "success" : "danger";
  return (
    <Badge tone={tone} dot className={className} title={parsed.description}>
      <code className="font-medium">{code === "" ? t("protocol.resultCode.none") : code}</code>
      <span className="sr-only">{parsed.description}</span>
    </Badge>
  );
}

/** A status label as the server sent it. An unknown label is marked, never replaced by a known one. */
export function StatusLabel({ type, label, className }: { type: StatusType; label: string; className?: string }) {
  const status = describeStatus(type, label);
  return (
    <Badge tone={status.known ? "neutral" : "warning"} className={className} title={status.description}>
      <code className="font-medium">{status.label}</code>
      {!status.known && <span className="font-normal">{t("protocol.status.notDefined")}</span>}
    </Badge>
  );
}
