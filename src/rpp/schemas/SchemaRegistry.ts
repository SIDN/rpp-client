import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { isJsonObject } from "../core/types/json";
import { enrichWithUnevaluatedProperties } from "./enrichSchema";
import { toIssues, type ValidationResult } from "./validation";

export const JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema";

/** A preset is identified by its identifier and exact version. */
export interface PresetSchemaKey {
  id: string;
  version: string;
}

/** A schema document that is not usable: wrong dialect, not self-contained, not the preset asked for, or not a valid schema. */
export class SchemaDocumentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SchemaDocumentError";
  }
}

export interface SchemaRegistry {
  /** Adds the Preset Schema of a preset (json §Preset Schema), replacing one of the same preset. */
  addPresetSchema(document: unknown, expected?: PresetSchemaKey): PresetSchemaKey;
  has(key: PresetSchemaKey): boolean;
  keys(): PresetSchemaKey[];
  /** Names of the definitions of a preset's schema, such as `domainName.create`. */
  definitions(key: PresetSchemaKey): string[];
  /** Validates a value against one definition. Never changes the value. */
  validate(key: PresetSchemaKey, definition: string, value: unknown): ValidationResult;
}

const keyString = (key: PresetSchemaKey) => `${key.id}@${key.version}`;
const REFERENCE_KEYWORDS = new Set(["$ref", "$dynamicRef", "$recursiveRef"]);

function externalReference(node: unknown): string | undefined {
  if (Array.isArray(node)) return node.map(externalReference).find((found) => found !== undefined);
  if (!isJsonObject(node)) return undefined;
  for (const [key, value] of Object.entries(node)) {
    if (REFERENCE_KEYWORDS.has(key) && typeof value === "string" && !value.startsWith("#")) return value;
    const nested = externalReference(value);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

export function createSchemaRegistry(): SchemaRegistry {
  // Server schemas are data to validate with, not schemas to lint: unknown keywords (`rpp:*`) and formats are ignored.
  // No `loadSchema`: a reference outside the document is never fetched.
  const ajv = new Ajv2020({ strict: false, allErrors: true, logger: false });
  addFormats(ajv);

  const schemas = new Map<string, { key: PresetSchemaKey; schemaId: string; definitions: string[] }>();
  const validators = new Map<string, ReturnType<typeof ajv.compile> | string>();

  function addPresetSchema(document: unknown, expected?: PresetSchemaKey): PresetSchemaKey {
    if (!isJsonObject(document)) throw new SchemaDocumentError("The Preset Schema is not a JSON object");
    if (document.$schema !== JSON_SCHEMA_2020_12) {
      throw new SchemaDocumentError(`The Preset Schema is not JSON Schema 2020-12 ($schema: ${String(document.$schema)})`);
    }
    const preset = document["rpp:preset"];
    if (!isJsonObject(preset) || typeof preset.id !== "string" || typeof preset.version !== "string") {
      throw new SchemaDocumentError('The Preset Schema has no "rpp:preset" with an id and version');
    }
    const key: PresetSchemaKey = { id: preset.id, version: preset.version };
    if (expected && keyString(expected) !== keyString(key)) {
      throw new SchemaDocumentError(`The Preset Schema is for ${keyString(key)}, not for ${keyString(expected)}`);
    }
    if (!isJsonObject(document.$defs)) throw new SchemaDocumentError("The Preset Schema has no $defs");
    const outside = externalReference(document);
    if (outside !== undefined) {
      throw new SchemaDocumentError(`The Preset Schema is not self-contained: it references ${outside}`);
    }

    const schemaId = typeof document.$id === "string" ? document.$id : `urn:rpp-client:preset:${keyString(key)}`;
    const known = [...schemas.values()].find((entry) => entry.schemaId === schemaId);
    if (known && keyString(known.key) !== keyString(key)) {
      throw new SchemaDocumentError(`The $id ${schemaId} is already used by ${keyString(known.key)}`);
    }

    remove(key);
    try {
      ajv.addSchema({ ...enrichWithUnevaluatedProperties(document), $id: schemaId });
    } catch (cause) {
      throw new SchemaDocumentError(`The Preset Schema is not a valid schema: ${(cause as Error).message}`, { cause });
    }
    schemas.set(keyString(key), { key, schemaId, definitions: Object.keys(document.$defs) });
    return key;
  }

  function remove(key: PresetSchemaKey): void {
    const entry = schemas.get(keyString(key));
    if (!entry) return;
    ajv.removeSchema(entry.schemaId);
    for (const cached of validators.keys()) if (cached.startsWith(`${keyString(key)}#`)) validators.delete(cached);
    schemas.delete(keyString(key));
  }

  function validate(key: PresetSchemaKey, definition: string, value: unknown): ValidationResult {
    const entry = schemas.get(keyString(key));
    if (!entry) return { status: "unavailable", reason: `No schema is loaded for preset ${keyString(key)}` };
    if (!entry.definitions.includes(definition)) {
      return { status: "unavailable", reason: `The schema of ${keyString(key)} has no definition ${definition}` };
    }
    const cacheKey = `${keyString(key)}#${definition}`;
    let validator = validators.get(cacheKey);
    if (validator === undefined) {
      try {
        const pointer = definition.replaceAll("~", "~0").replaceAll("/", "~1");
        validator = ajv.compile({ $ref: `${entry.schemaId}#/$defs/${pointer}` });
      } catch (cause) {
        validator = `The schema of ${keyString(key)} cannot be compiled for ${definition}: ${(cause as Error).message}`;
      }
      validators.set(cacheKey, validator);
    }
    if (typeof validator === "string") return { status: "unavailable", reason: validator };
    return validator(value) ? { status: "valid" } : { status: "invalid", issues: toIssues(validator.errors) };
  }

  return {
    addPresetSchema,
    has: (key) => schemas.has(keyString(key)),
    keys: () => [...schemas.values()].map((entry) => ({ ...entry.key })),
    definitions: (key) => [...(schemas.get(keyString(key))?.definitions ?? [])],
    validate,
  };
}
