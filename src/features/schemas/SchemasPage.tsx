import { useMemo, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
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
import { referenceLabel } from "@/features/capabilities/capabilityView";
import type { CapabilitySnapshot, PresetCapability } from "@/rpp/discovery/capability-types";
import { defaultPreset } from "@/rpp/discovery/capabilities";
import { toFailure } from "@/rpp/errors/RppError";
import { fetchPresetSchema } from "@/rpp/schemas/presetSchemaLoader";
import { createSchemaRegistry, SchemaDocumentError } from "@/rpp/schemas/SchemaRegistry";
import { SchemaExplorer } from "./SchemaExplorer";
import { buildSchemaTree } from "./schemaTree";

const header = <PageHeader title="Schemas" description="The JSON Schema of a preset" />;

function kilobytes(text: string): string {
  return `${(new Blob([text]).size / 1024).toFixed(1)} kB`;
}

export function SchemasPage() {
  const discovery = useDiscoveryState();

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
      <PresetSchemas snapshot={discovery.snapshot} />
    </>
  );
}

function PresetSchemas({ snapshot }: { snapshot: CapabilitySnapshot }) {
  const { session, resolvedPreset } = useConnection();
  const [picked, setPicked] = useState<string>();

  const initial = resolvedPreset.chosen ?? defaultPreset(snapshot) ?? snapshot.presets[0];
  const preset: PresetCapability | undefined = snapshot.presets.find((entry) => referenceLabel(entry) === picked) ?? initial;

  const query = useQuery({
    queryKey: ["preset-schema", session?.id, preset?.id, preset?.version] as const,
    queryFn:
      session && preset
        ? async ({ signal }) => {
            const key = { id: preset.id, version: preset.version };
            const document = await fetchPresetSchema({ transport: session.transport, preset: key, signal });
            // Whatever the server sent is shown; the registry says whether it is a document this client would validate with.
            let problem: string | undefined;
            try {
              createSchemaRegistry().addPresetSchema(document, key);
            } catch (error) {
              problem = error instanceof SchemaDocumentError ? error.message : String(error);
            }
            return { document, problem };
          }
        : skipToken,
    staleTime: Infinity,
  });

  const tree = useMemo(() => (query.data ? buildSchemaTree(query.data.document) : undefined), [query.data]);
  const [showRaw, setShowRaw] = useState(false);
  const raw = useMemo(() => (showRaw && query.data ? JSON.stringify(query.data.document, null, 2) : undefined), [showRaw, query.data]);

  if (snapshot.presets.length === 0 || !preset) {
    return (
      <Callout tone="warning" title="The server lists no presets">
        Its discovery document has no presets, so there is no schema to show.
      </Callout>
    );
  }

  return (
    <>
      <Section id="preset" title="Preset" description="Each preset has its own schema.">
        <Field label="Preset" className="max-w-md">
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
                  {entry.name ?? entry.id} ({referenceLabel(entry)}){entry.isDefault ? ", default" : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {preset.description && <p className="max-w-[62ch] text-muted-foreground">{preset.description}</p>}
      </Section>

      <Section id="schema" title="Schema" description="The definitions of the preset, each with what it is made of. A reference leads to the definition it points to.">
        {query.isPending && query.fetchStatus !== "idle" && <Callout tone="info" title="Reading the schema of the preset" />}
        {query.isError && <FailureView failure={toFailure(query.error)} />}
        {query.data?.problem && (
          <Callout tone="warning" title="This is not a document the client would validate with">
            {query.data.problem} It is shown as received.
          </Callout>
        )}
        {tree && (
          <>
            <DefinitionList>
              <DefinitionRow term="Schema">{tree.about.schema ? <code className="break-all">{tree.about.schema}</code> : "Not given"}</DefinitionRow>
              <DefinitionRow term="Identifier">{tree.about.id ? <code className="break-all">{tree.about.id}</code> : "Not given"}</DefinitionRow>
              <DefinitionRow term="Preset">{tree.about.preset ? <code>{tree.about.preset}</code> : "Not given"}</DefinitionRow>
            </DefinitionList>
            <SchemaExplorer key={referenceLabel(preset)} tree={tree} />
          </>
        )}
      </Section>

      {query.data && (
        <Section id="effective" title="Effective schema" description="The schema as the server publishes it: the definitions of the bundle, with those of the extensions and profiles of the preset composed in place.">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" aria-expanded={showRaw} aria-controls="effective-schema" onClick={() => setShowRaw(!showRaw)}>
              {showRaw ? "Hide effective schema" : "Show effective schema"}
            </Button>
            {raw && <span className="text-sm text-muted-foreground">{kilobytes(raw)}</span>}
          </div>
          {raw && (
            <pre id="effective-schema" tabIndex={0} aria-label="Effective schema" className="max-h-[70dvh] overflow-auto rounded-md border border-border bg-muted/50 p-4 font-mono text-xs">
              {raw}
            </pre>
          )}
        </Section>
      )}
    </>
  );
}
