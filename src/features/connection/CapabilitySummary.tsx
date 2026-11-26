import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import type { CapabilitySnapshot } from "@/rpp/discovery/capability-types";
import { advertisedExtensions } from "@/rpp/discovery/capabilities";
import { t } from "@/i18n";

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
      <dt className="font-medium">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const originOf = (url: string): string | undefined => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/** What the server said about itself. Its advertised addresses are shown, not followed. */
export function CapabilitySummary({
  snapshot,
  configuredBaseUrl,
  warnings,
}: {
  snapshot: CapabilitySnapshot;
  configuredBaseUrl: string;
  warnings: readonly string[];
}) {
  const extensions = advertisedExtensions(snapshot);
  const otherOrigin = snapshot.versions.filter((version) => originOf(version.baseUrl) !== originOf(configuredBaseUrl));

  return (
    <div className="flex flex-col gap-4">
      {otherOrigin.length > 0 && (
        <Callout tone="warning" title={t("connection.capability.otherAddress")}>
          {t("connection.capability.keepAddressLead")} {otherOrigin.map((version) => <code key={version.version}>{version.baseUrl}</code>)}{t("connection.capability.keepAddressEnd")}
        </Callout>
      )}
      {warnings.length > 0 && (
        <Callout tone="warning" title={t("connection.capability.remarks", { count: warnings.length })}>
          <ul className="list-disc pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Callout>
      )}
      <dl className="divide-y divide-border border-y border-border">
        {snapshot.environment && (
          <Row term={t("connection.capability.environment")}>
            {snapshot.environment.name}, {snapshot.environment.status}
          </Row>
        )}
        <Row term={t("connection.capability.versions")}>
          {snapshot.versions.length === 0
            ? t("connection.capability.noneListed")
            : snapshot.versions.map((version) => (
                <div key={version.version}>
                  {version.version} {t("connection.capability.at")} <code>{version.baseUrl}</code>
                </div>
              ))}
        </Row>
        <Row term={t("connection.capability.objects")}>{snapshot.objects.length === 0 ? t("connection.capability.noneListed") : snapshot.objects.join(", ")}</Row>
        <Row term={t("connection.capability.presets")}>
          {snapshot.presets.length === 0 ? (
            t("connection.capability.noneListed")
          ) : (
            <ul className="flex flex-col gap-1">
              {snapshot.presets.map((preset) => (
                <li key={`${preset.id}@${preset.version}`} className="flex flex-wrap items-center gap-2">
                  <code>{preset.id}</code>
                  <span className="text-muted-foreground">{t("connection.capability.version", { version: preset.version })}</span>
                  {preset.isDefault && <Badge tone="info">{t("connection.capability.default")}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row term={t("connection.capability.extensions")}>
          {extensions.length === 0 ? t("connection.capability.noneAdvertised") : extensions.map((extension) => `${extension.name ?? extension.id} ${extension.version}`).join(", ")}
        </Row>
        <Row term={t("connection.capability.tlds")}>{snapshot.tlds.length === 0 ? t("connection.capability.noneListed") : snapshot.tlds.join(", ")}</Row>
        <Row term={t("connection.capability.read")}>{new Date(snapshot.source.retrievedAt).toLocaleString()}</Row>
      </dl>
    </div>
  );
}
