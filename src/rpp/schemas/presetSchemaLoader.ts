import type { RppTransport } from "../client/RppTransport";
import { classifyResponse, RppError } from "../errors/RppError";
import type { PresetSchemaKey, SchemaRegistry } from "./SchemaRegistry";
import { SchemaDocumentError } from "./SchemaRegistry";

export const SCHEMA_MEDIA_TYPE = "application/schema+json";

/**
 * Fetches the Preset Schema, the `schema` sub-resource of the Preset Data Object, as the server sent it. The request names no
 * preset: the document is in its native media type (core, native media types). Nothing is checked about the document.
 */
export async function fetchPresetSchema(options: {
  transport: RppTransport;
  preset: PresetSchemaKey;
  signal?: AbortSignal;
}): Promise<unknown> {
  const { transport, preset, signal } = options;
  // Identifiers such as URNs keep their colons, as the server writes the path.
  const segment = encodeURIComponent(preset.id).replaceAll("%3A", ":");
  const response = await transport.send({
    method: "GET",
    target: `presets/${segment}/schema`,
    accept: [SCHEMA_MEDIA_TYPE],
    preset: null,
    authenticate: false,
    signal,
  });
  const outcome = classifyResponse(response);
  if (!outcome.ok) throw new RppError(outcome.failure);
  return outcome.data;
}

/** Fetches the Preset Schema and adds it to the registry, which refuses a document it cannot trust. */
export async function loadPresetSchema(options: {
  transport: RppTransport;
  registry: SchemaRegistry;
  preset: PresetSchemaKey;
  signal?: AbortSignal;
}): Promise<PresetSchemaKey> {
  const { registry, preset } = options;
  const document = await fetchPresetSchema(options);
  try {
    return registry.addPresetSchema(document, preset);
  } catch (error) {
    if (error instanceof SchemaDocumentError) throw new RppError({ kind: "schema-document", message: error.message });
    throw error;
  }
}
