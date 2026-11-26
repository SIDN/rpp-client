import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { DefinitionList, DefinitionRow } from "@/components/common/definition";
import { PageHeader, Section } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { FailureView } from "@/components/protocol/FailureView";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Callout } from "@/components/ui/callout";
import { Field, Select } from "@/components/ui/field";
import { t } from "@/i18n";
import { referenceLabel } from "@/features/capabilities/capabilityView";
import type { CapabilitySnapshot, PresetCapability } from "@/rpp/discovery/capability-types";
import { defaultPreset } from "@/rpp/discovery/capabilities";
import { toFailure } from "@/rpp/errors/RppError";
import { presetSchemaQuery } from "@/features/shared/presetSchema";
import { SchemaExplorer } from "./SchemaExplorer";
import { buildSchemaTree } from "./schemaTree";

const Header = () => <PageHeader title={t("schemas.page.title")} description={t("schemas.page.description")} />;

function kilobytes(text: string): string {
  return `${(new Blob([text]).size / 1024).toFixed(1)} kB`;
}

export function SchemasPage() {
  const discovery = useDiscoveryState();

  if (discovery.status === "not-started") {
    return (
      <>
        <Header />
        <NotConnected />
      </>
    );
  }
  if (discovery.status === "loading") {
    return (
      <>
        <Header />
        <Callout tone="info" title={t("schemas.loading.capabilities")} />
      </>
    );
  }
  if (discovery.status === "failed") {
    return (
      <>
        <Header />
        <Callout tone="danger" title={t("schemas.error.capabilities")}>
          {discovery.error.message}
        </Callout>
        <Link to="/connection" className={buttonVariants({ variant: "secondary", className: "self-start" })}>
          {t("schemas.connectionLink")}
        </Link>
      </>
    );
  }
  return (
    <>
      <Header />
      <PresetSchemas snapshot={discovery.snapshot} />
    </>
  );
}

function PresetSchemas({ snapshot }: { snapshot: CapabilitySnapshot }) {
  const { session, resolvedPreset } = useConnection();
  const [picked, setPicked] = useState<string>();

  const initial = resolvedPreset.chosen ?? defaultPreset(snapshot) ?? snapshot.presets[0];
  const preset: PresetCapability | undefined = snapshot.presets.find((entry) => referenceLabel(entry) === picked) ?? initial;

  const query = useQuery(presetSchemaQuery(session, preset));

  const tree = useMemo(() => (query.data ? buildSchemaTree(query.data.document) : undefined), [query.data]);
  const [showRaw, setShowRaw] = useState(false);
  const raw = useMemo(() => (showRaw && query.data ? JSON.stringify(query.data.document, null, 2) : undefined), [showRaw, query.data]);

  if (snapshot.presets.length === 0 || !preset) {
    return (
      <Callout tone="warning" title={t("schemas.empty.presetsTitle")}>
        {t("schemas.empty.presetsDescription")}
      </Callout>
    );
  }

  return (
    <>
      <Section id="preset" title={t("schemas.preset.title")} description={t("schemas.preset.description")}>
        <Field label={t("schemas.preset.label")} className="max-w-md">
          {(control) => (
            <Select
              {...control}
              value={referenceLabel(preset)}
              onChange={(event) => {
                setPicked(event.target.value);
                setShowRaw(false);
              }}
            >
              {snapshot.presets.map((entry) => (
                <option key={referenceLabel(entry)} value={referenceLabel(entry)}>
                  {entry.name ?? entry.id} ({referenceLabel(entry)}){entry.isDefault ? `, ${t("schemas.preset.default")}` : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {preset.description && <p className="max-w-[62ch] text-muted-foreground">{preset.description}</p>}
      </Section>

      <Section id="schema" title={t("schemas.schema.title")} description={t("schemas.schema.description")}>
        {query.isPending && query.fetchStatus !== "idle" && <Callout tone="info" title={t("schemas.loading.schema")} />}
        {query.isError && <FailureView failure={toFailure(query.error)} />}
        {query.data?.problem && (
          <Callout tone="warning" title={t("schemas.warning.unusable")}>
            {query.data.problem} {t("schemas.warning.shownAsReceived")}
          </Callout>
        )}
        {tree && (
          <>
            <DefinitionList>
              <DefinitionRow term={t("schemas.tree.schema")}>{tree.about.schema ? <code className="break-all">{tree.about.schema}</code> : t("schemas.tree.notGiven")}</DefinitionRow>
              <DefinitionRow term={t("schemas.tree.identifier")}>{tree.about.id ? <code className="break-all">{tree.about.id}</code> : t("schemas.tree.notGiven")}</DefinitionRow>
              <DefinitionRow term={t("schemas.tree.preset")}>{tree.about.preset ? <code>{tree.about.preset}</code> : t("schemas.tree.notGiven")}</DefinitionRow>
            </DefinitionList>
            <SchemaExplorer key={referenceLabel(preset)} tree={tree} />
          </>
        )}
      </Section>

      {query.data && (
        <Section id="effective" title={t("schemas.effective.title")} description={t("schemas.effective.description")}>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" aria-expanded={showRaw} aria-controls="effective-schema" onClick={() => setShowRaw(!showRaw)}>
              {showRaw ? t("schemas.effective.hide") : t("schemas.effective.show")}
            </Button>
            {raw && <span className="text-sm text-muted-foreground">{kilobytes(raw)}</span>}
          </div>
          {raw && (
            <pre id="effective-schema" tabIndex={0} aria-label={t("schemas.effective.title")} className="max-h-[70dvh] overflow-auto rounded-md border border-border bg-muted/50 p-4 font-mono text-xs">
              {raw}
            </pre>
          )}
        </Section>
      )}
    </>
  );
}
