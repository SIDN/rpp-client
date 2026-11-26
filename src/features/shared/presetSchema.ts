import { queryOptions, skipToken, useQuery } from "@tanstack/react-query";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import type { Session } from "@/application/connection/session";
import type { VersionedReference } from "@/rpp/discovery/capability-types";
import { defaultPreset } from "@/rpp/discovery/capabilities";
import { fetchPresetSchema } from "@/rpp/schemas/presetSchemaLoader";
import { createSchemaRegistry, SchemaDocumentError } from "@/rpp/schemas/SchemaRegistry";

export interface PresetSchemaResult {
  /** As the server sent it. */
  document: unknown;
  /** Why the schema registry would refuse the document, if it would. */
  problem: string | undefined;
}

/** The query of a preset's schema, read once per connection; the Schemas screen and the Change screens share it. */
export function presetSchemaQuery(session: Session | undefined, preset: VersionedReference | undefined, enabled = true) {
  return queryOptions({
    queryKey: ["preset-schema", session?.id, preset?.id, preset?.version] as const,
    queryFn:
      session && preset && enabled
        ? async ({ signal }: { signal: AbortSignal }): Promise<PresetSchemaResult> => {
            const key = { id: preset.id, version: preset.version };
            const document = await fetchPresetSchema({ transport: session.transport, preset: key, signal });
            // Whatever the server sent is kept; the registry says whether it is a document this client would validate with.
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
}

/** The schema of the preset requests are made under (the chosen one, else the server's default). Read only when `enabled`. */
export function usePresetSchema(enabled = true) {
  const connection = useConnection();
  const discovery = useDiscoveryState();
  const snapshot = discovery.status === "ready" || discovery.status === "partial" ? discovery.snapshot : undefined;
  const preset = connection.resolvedPreset?.chosen ?? (snapshot ? defaultPreset(snapshot) : undefined);
  const query = useQuery(presetSchemaQuery(connection.session, preset, enabled));
  return { preset, query };
}
