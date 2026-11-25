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
import { isResourceType } from "@/rpp/core/types/resources";
import type { CapabilitySnapshot, PresetCapability, VersionedReference } from "@/rpp/discovery/capability-types";
import { advertisedExtensions } from "@/rpp/discovery/capabilities";
import { detectExtensions } from "@/rpp/discovery/extensionDetection";
import { originOf, referenceLabel, unmodelledMembers } from "./capabilityView";

const Row = DefinitionRow;
const Rows = DefinitionList;

const None = ({ children = "None listed" }: { children?: ReactNode }) => <Nothing>{children}</Nothing>;

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

  const header = <PageHeader title="Capabilities" description="The discovery document of the server: what it offers, shown as it was received." />;

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
  if (discovery.status === "failed") {
    return (
      <>
        {header}
        <Callout tone="danger" title="The capabilities of the server could not be read">
          {discovery.error.message}
          {discovery.error.exchangeId && (
            <>
              {" "}
              The request is recorded as exchange <code>{discovery.error.exchangeId}</code>.
            </>
          )}
        </Callout>
        <Link to="/connection" className={buttonVariants({ variant: "secondary", className: "self-start" })}>
          Go to the connection
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
        <Callout tone="warning" title={`The discovery document has ${warnings.length} remark(s)`}>
          <ul className="list-disc pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Callout>
      )}

      <Section id="source" title="Document" description="Where this was read, and when.">
        <Rows>
          <Row term="Address">
            <code className="break-all">{snapshot.source.url}</code>
          </Row>
          <Row term="Read">{new Date(snapshot.source.retrievedAt).toLocaleString()} (this computer)</Row>
          <Row term="Server time">{snapshot.serverDatetime ?? <None>Not given</None>}</Row>
          <Row term="Exchange">
            <code>{snapshot.source.exchangeId}</code>
          </Row>
        </Rows>
      </Section>

      <Section id="server" title="Server">
        <Rows>
          <Row term="Environment">
            {snapshot.environment ? `${snapshot.environment.name}, ${snapshot.environment.status}` : <None>Not given</None>}
          </Row>
          <Row term="RPP versions">
            {snapshot.versions.length === 0 ? (
              <None />
            ) : (
              <ul className="flex flex-col gap-1">
                {snapshot.versions.map((version) => (
                  <li key={version.version} className="flex flex-wrap items-center gap-2">
                    <span>{version.version}</span>
                    <code className="break-all">{version.baseUrl}</code>
                    {originOf(version.baseUrl) !== configuredOrigin && <Badge tone="warning">other origin, not followed</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Row>
          <Row term="TLDs">{snapshot.tlds.length === 0 ? <None /> : snapshot.tlds.join(", ")}</Row>
          <Row term="Profiles">
            <References items={snapshot.profiles} />
          </Row>
        </Rows>
      </Section>

      <Section id="objects" title="Objects" description="The object types the server manages.">
        {snapshot.objects.length === 0 ? (
          <None />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {snapshot.objects.map((type) => (
              <li key={type}>
                <Badge tone={isResourceType(type) ? "success" : "warning"} dot>
                  <code>{type}</code>
                  {!isResourceType(type) && <span className="font-normal">not known to this client</span>}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="presets" title="Presets" description="A preset fixes the extensions and profiles a request works with.">
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
        title="Extensions"
        description="Offered by the server. This client has no extension modules yet, so none of them is supported here."
      >
        {extensions.advertised.length === 0 ? (
          <None>None advertised</None>
        ) : (
          <ul className="flex flex-col gap-6">
            {extensions.advertised.map(({ status, advertised }) => (
              <li key={referenceLabel(advertised)}>
                <article aria-label={`Extension ${referenceLabel(advertised)}`} className="flex flex-col gap-2">
                  <h3 className="flex flex-wrap items-center gap-2">
                    <span>{advertised.name ?? advertised.id}</span>
                    <Badge tone={status === "available" ? "success" : "neutral"}>
                      {status === "available" ? "supported by this client" : "not supported by this client"}
                    </Badge>
                  </h3>
                  <Rows>
                    <Row term="Identifier">
                      <code className="break-all">{advertised.id}</code>
                    </Row>
                    <Row term="Version">{advertised.version}</Row>
                    <Row term="Address">{advertised.url ? <code className="break-all">{advertised.url}</code> : <None>Not given</None>}</Row>
                    <Row term="In presets">{presetsUsing(snapshot, advertised).join(", ") || <None>None of the presets</None>}</Row>
                  </Rows>
                </article>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="raw" title="Document as received" description="Including members this client does not interpret.">
        {others.length > 0 && (
          <Callout tone="info" title="Members this client does not interpret">
            {others.map((name, index) => (
              <span key={name}>
                {index > 0 && ", "}
                <code>{name}</code>
              </span>
            ))}
          </Callout>
        )}
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-3 py-2 font-medium">Show the JSON</summary>
          <pre tabIndex={0} aria-label="Discovery document" className="max-h-[32rem] overflow-auto border-t border-border p-3 font-mono text-xs">
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
    <article aria-label={`Preset ${referenceLabel(preset)}`} className="flex flex-col gap-2">
      <h3 className="flex flex-wrap items-center gap-2">
        <code>{referenceLabel(preset)}</code>
        {preset.name && <span className="font-normal">{preset.name}</span>}
        {preset.isDefault && <Badge tone="info">default</Badge>}
        {inUse && <Badge tone="success" dot>sent with requests</Badge>}
      </h3>
      <Rows>
        {preset.description && <Row term="Description">{preset.description}</Row>}
        {preset.rppVersion && <Row term="RPP version">{preset.rppVersion}</Row>}
        {preset.url && (
          <Row term="Schema address">
            <code className="break-all">{preset.url}</code>
          </Row>
        )}
        <Row term="Base presets">
          <References items={preset.basePresets} />
        </Row>
        <Row term="Extensions">
          <References items={preset.extensions} />
        </Row>
        <Row term="Profiles">
          <References items={preset.profiles} />
        </Row>
        <Row term="Bound profiles">
          <References items={preset.boundProfiles} />
        </Row>
      </Rows>
    </article>
  );
}
