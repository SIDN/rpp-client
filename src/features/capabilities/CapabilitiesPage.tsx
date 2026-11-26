import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { PageHeader, Section } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { buttonVariants } from "@/components/ui/button-variants";
import { t } from "@/i18n";
import { isResourceType } from "@/rpp/core/types/resources";
import type { CapabilitySnapshot, PresetCapability, VersionedReference } from "@/rpp/discovery/capability-types";
import { advertisedExtensions } from "@/rpp/discovery/capabilities";
import { detectExtensions } from "@/rpp/discovery/extensionDetection";
import { originOf, referenceLabel, unmodelledMembers } from "./capabilityView";

const Row = DefinitionRow;
const Rows = DefinitionList;

const None = ({ children }: { children?: ReactNode }) => <Nothing>{children ?? t("connection.capability.noneListed")}</Nothing>;

function References({ items }: { items: readonly VersionedReference[] }) {
  if (items.length === 0) return <None />;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={referenceLabel(item)}>
          <code>{referenceLabel(item)}</code>
        </li>
      ))}
    </ul>
  );
}

export function CapabilitiesPage() {
  const discovery = useDiscoveryState();

  const header = <PageHeader title={t("capabilities.page.title")} description={t("capabilities.page.description")} />;

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
        <Callout tone="info" title={t("capabilities.reading")} />
      </>
    );
  }
  if (discovery.status === "failed") {
    return (
      <>
        {header}
        <Callout tone="danger" title={t("capabilities.readFailed")}>
          {discovery.error.message}
          {discovery.error.exchangeId && (
            <>
              {" "}
              {t("capabilities.exchangeRecordedLead")} <code>{discovery.error.exchangeId}</code>{t("capabilities.exchangeRecordedEnd")}
            </>
          )}
        </Callout>
        <Link to="/connection" className={buttonVariants({ variant: "secondary", className: "self-start" })}>
          {t("capabilities.goToConnection")}
        </Link>
      </>
    );
  }

  return (
    <>
      {header}
      <Document snapshot={discovery.snapshot} warnings={discovery.status === "partial" ? discovery.warnings : []} />
    </>
  );
}

function Document({ snapshot, warnings }: { snapshot: CapabilitySnapshot; warnings: readonly string[] }) {
  const { session, resolvedPreset } = useConnection();
  const configuredOrigin = session ? originOf(session.profile.baseUrl) : undefined;
  const extensions = detectExtensions(advertisedExtensions(snapshot), []);
  const others = unmodelledMembers(snapshot.raw);

  return (
    <>
      {warnings.length > 0 && (
        <Callout tone="warning" title={t("connection.capability.remarks", { count: warnings.length })}>
          <ul className="list-disc pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Callout>
      )}

      <Section id="source" title={t("capabilities.source.title")} description={t("capabilities.source.description")}>
        <Rows>
          <Row term={t("capabilities.source.address")}>
            <code className="break-all">{snapshot.source.url}</code>
          </Row>
          <Row term={t("capabilities.source.read")}>{new Date(snapshot.source.retrievedAt).toLocaleString()} ({t("capabilities.source.localTime")})</Row>
          <Row term={t("capabilities.source.serverTime")}>{snapshot.serverDatetime ?? <None>{t("capabilities.notGiven")}</None>}</Row>
          <Row term={t("capabilities.source.exchange")}>
            <code>{snapshot.source.exchangeId}</code>
          </Row>
        </Rows>
      </Section>

      <Section id="server" title={t("capabilities.server.title")}>
        <Rows>
          <Row term={t("connection.capability.environment")}>
            {snapshot.environment ? `${snapshot.environment.name}, ${snapshot.environment.status}` : <None>{t("capabilities.notGiven")}</None>}
          </Row>
          <Row term={t("connection.capability.versions")}>
            {snapshot.versions.length === 0 ? (
              <None />
            ) : (
              <ul className="flex flex-col gap-1">
                {snapshot.versions.map((version) => (
                  <li key={version.version} className="flex flex-wrap items-center gap-2">
                    <span>{version.version}</span>
                    <code className="break-all">{version.baseUrl}</code>
                    {originOf(version.baseUrl) !== configuredOrigin && <Badge tone="warning">{t("capabilities.server.otherOrigin")}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Row>
          <Row term={t("capabilities.server.tlds")}>{snapshot.tlds.length === 0 ? <None /> : snapshot.tlds.join(", ")}</Row>
          <Row term={t("capabilities.server.profiles")}>
            <References items={snapshot.profiles} />
          </Row>
        </Rows>
      </Section>

      <Section id="objects" title={t("capabilities.objects.title")} description={t("capabilities.objects.description")}>
        {snapshot.objects.length === 0 ? (
          <None />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {snapshot.objects.map((type) => (
              <li key={type}>
                <Badge tone={isResourceType(type) ? "success" : "warning"} dot>
                  <code>{type}</code>
                  {!isResourceType(type) && <span className="font-normal">{t("capabilities.objects.unknown")}</span>}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="presets" title={t("capabilities.presets.title")} description={t("capabilities.presets.description")}>
        {snapshot.presets.length === 0 ? (
          <None />
        ) : (
          <div className="flex flex-col gap-6">
            {snapshot.presets.map((preset) => (
              <PresetEntry
                key={referenceLabel(preset)}
                preset={preset}
                inUse={resolvedPreset.preset !== undefined && resolvedPreset.chosen === preset}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        id="extensions"
        title={t("capabilities.extensions.title")}
        description={t("capabilities.extensions.description")}
      >
        {extensions.advertised.length === 0 ? (
          <None>{t("connection.capability.noneAdvertised")}</None>
        ) : (
          <ul className="flex flex-col gap-6">
            {extensions.advertised.map(({ status, advertised }) => (
              <li key={referenceLabel(advertised)}>
                <article aria-label={t("capabilities.extensions.ariaLabel", { reference: referenceLabel(advertised) })} className="flex flex-col gap-2">
                  <h3 className="flex flex-wrap items-center gap-2">
                    <span>{advertised.name ?? advertised.id}</span>
                    <Badge tone={status === "available" ? "success" : "neutral"}>
                      {status === "available" ? t("capabilities.extensions.supported") : t("capabilities.extensions.unsupported")}
                    </Badge>
                  </h3>
                  <Rows>
                    <Row term={t("capabilities.extensions.identifier")}>
                      <code className="break-all">{advertised.id}</code>
                    </Row>
                    <Row term={t("capabilities.extensions.version")}>{advertised.version}</Row>
                    <Row term={t("capabilities.extensions.address")}>{advertised.url ? <code className="break-all">{advertised.url}</code> : <None>{t("capabilities.notGiven")}</None>}</Row>
                    <Row term={t("capabilities.extensions.inPresets")}>{presetsUsing(snapshot, advertised).join(", ") || <None>{t("capabilities.extensions.noneInPresets")}</None>}</Row>
                  </Rows>
                </article>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="raw" title={t("capabilities.raw.title")} description={t("capabilities.raw.description")}>
        {others.length > 0 && (
          <Callout tone="info" title={t("capabilities.raw.uninterpreted")}>
            {others.map((name, index) => (
              <span key={name}>
                {index > 0 && ", "}
                <code>{name}</code>
              </span>
            ))}
          </Callout>
        )}
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-3 py-2 font-medium">{t("capabilities.raw.showJson")}</summary>
          <pre tabIndex={0} aria-label={t("capabilities.raw.ariaLabel")} className="max-h-[32rem] overflow-auto border-t border-border p-3 font-mono text-xs">
            {JSON.stringify(snapshot.raw, null, 2)}
          </pre>
        </details>
      </Section>
    </>
  );
}

function presetsUsing(snapshot: CapabilitySnapshot, extension: VersionedReference): string[] {
  return snapshot.presets
    .filter((preset) => preset.extensions.some((candidate) => candidate.id === extension.id && candidate.version === extension.version))
    .map(referenceLabel);
}

function PresetEntry({ preset, inUse }: { preset: PresetCapability; inUse: boolean }) {
  return (
    <article aria-label={t("capabilities.preset.ariaLabel", { reference: referenceLabel(preset) })} className="flex flex-col gap-2">
      <h3 className="flex flex-wrap items-center gap-2">
        <code>{referenceLabel(preset)}</code>
        {preset.name && <span className="font-normal">{preset.name}</span>}
        {preset.isDefault && <Badge tone="info">{t("capabilities.preset.default")}</Badge>}
        {inUse && <Badge tone="success" dot>{t("capabilities.preset.inUse")}</Badge>}
      </h3>
      <Rows>
        {preset.description && <Row term={t("capabilities.preset.description")}>{preset.description}</Row>}
        {preset.rppVersion && <Row term={t("capabilities.preset.rppVersion")}>{preset.rppVersion}</Row>}
        {preset.url && (
          <Row term={t("capabilities.preset.schemaAddress")}>
            <code className="break-all">{preset.url}</code>
          </Row>
        )}
        <Row term={t("capabilities.preset.basePresets")}>
          <References items={preset.basePresets} />
        </Row>
        <Row term={t("capabilities.preset.extensions")}>
          <References items={preset.extensions} />
        </Row>
        <Row term={t("capabilities.preset.profiles")}>
          <References items={preset.profiles} />
        </Row>
        <Row term={t("capabilities.preset.boundProfiles")}>
          <References items={preset.boundProfiles} />
        </Row>
      </Rows>
    </article>
  );
}
