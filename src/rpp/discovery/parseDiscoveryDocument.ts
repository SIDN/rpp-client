import { DiscoveryError } from "../errors/DiscoveryError";
import type {
  CapabilitySnapshot,
  PresetCapability,
  ServerExtension,
  ServerVersion,
  VersionedReference,
} from "./capability-types";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const keyOf = (reference: VersionedReference) => `${reference.id}@${reference.version}`;

function parseList<T>(
  value: unknown,
  path: string,
  warnings: string[],
  parseItem: (item: unknown, path: string) => T | undefined,
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push(`${path}: expected an array`);
    return [];
  }
  const items: T[] = [];
  value.forEach((item, index) => {
    const parsed = parseItem(item, `${path}/${index}`);
    if (parsed !== undefined) items.push(parsed);
  });
  return items;
}

function parseStrings(value: unknown, path: string, warnings: string[]): string[] {
  return parseList(value, path, warnings, (item, itemPath) => {
    if (typeof item === "string") return item;
    warnings.push(`${itemPath}: expected a string`);
    return undefined;
  });
}

function optionalString(object: JsonObject, key: string, path: string, warnings: string[]): string | undefined {
  const value = object[key];
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  warnings.push(`${path}/${key}: expected a string`);
  return undefined;
}

function parseReference(item: unknown, path: string, warnings: string[]): VersionedReference | undefined {
  if (!isObject(item) || typeof item.id !== "string" || typeof item.version !== "string") {
    warnings.push(`${path}: expected an object with a string id and version; entry ignored`);
    return undefined;
  }
  return { id: item.id, version: item.version };
}

function parseExtension(item: unknown, path: string, warnings: string[]): ServerExtension | undefined {
  const reference = parseReference(item, path, warnings);
  if (!reference || !isObject(item)) return undefined;
  const name = optionalString(item, "name", path, warnings);
  const url = optionalString(item, "url", path, warnings);
  if (name === undefined) warnings.push(`${path}: extension has no name`);
  if (url === undefined) warnings.push(`${path}: extension has no url`);
  return { ...reference, name, url };
}

function parsePreset(item: unknown, path: string, warnings: string[]): PresetCapability | undefined {
  const reference = parseReference(item, path, warnings);
  if (!reference || !isObject(item)) return undefined;
  return {
    ...reference,
    name: optionalString(item, "name", path, warnings),
    description: optionalString(item, "description", path, warnings),
    rppVersion: optionalString(item, "rppVersion", path, warnings),
    url: optionalString(item, "url", path, warnings),
    extensions: parseList(item.extensions, `${path}/extensions`, warnings, (entry, entryPath) =>
      parseExtension(entry, entryPath, warnings),
    ),
    profiles: parseList(item.profiles, `${path}/profiles`, warnings, (entry, entryPath) =>
      parseReference(entry, entryPath, warnings),
    ),
    boundProfiles: parseList(item.boundProfiles, `${path}/boundProfiles`, warnings, (entry, entryPath) =>
      parseReference(entry, entryPath, warnings),
    ),
    basePresets: parseList(item.basePresets, `${path}/basePresets`, warnings, (entry, entryPath) =>
      parseReference(entry, entryPath, warnings),
    ),
    isDefault: item.defaultPreset === true,
  };
}

function parseVersion(item: unknown, path: string, warnings: string[]): ServerVersion | undefined {
  if (!isObject(item) || typeof item.version !== "string" || typeof item.baseUrl !== "string") {
    warnings.push(`${path}: expected an object with a string version and baseUrl; entry ignored`);
    return undefined;
  }
  try {
    if (new URL(item.baseUrl).protocol !== "https:") warnings.push(`${path}/baseUrl: not an https URL`);
  } catch {
    warnings.push(`${path}/baseUrl: not an absolute URL`);
  }
  return { version: item.version, baseUrl: item.baseUrl };
}

function dedupe<T extends VersionedReference>(items: T[], path: string, warnings: string[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) {
      warnings.push(`${path}: ${key} is listed more than once`);
      return false;
    }
    seen.add(key);
    return true;
  });
}

export type DiscoverySource = CapabilitySnapshot["source"];

/**
 * Reads a discovery document. Problems that leave the document usable become warnings and the affected entries are left out;
 * only a body that is not a JSON object is an error. Nothing is inferred for what the document leaves out.
 */
export function parseDiscoveryDocument(
  document: unknown,
  source: DiscoverySource,
): { snapshot: CapabilitySnapshot; warnings: string[] } {
  if (!isObject(document)) {
    throw new DiscoveryError("invalid-document", "The discovery document is not a JSON object", {
      exchangeId: source.exchangeId,
    });
  }
  const warnings: string[] = [];
  if (document["@type"] !== "discovery") warnings.push(`/@type: expected "discovery"`);

  const versions = parseList(document.versions, "/versions", warnings, (item, path) => parseVersion(item, path, warnings));
  if (versions.length === 0) warnings.push("/versions: the server lists no usable version");

  let environment: CapabilitySnapshot["environment"];
  if (isObject(document.environment) && typeof document.environment.name === "string" && typeof document.environment.status === "string") {
    environment = { name: document.environment.name, status: document.environment.status };
  } else {
    warnings.push("/environment: expected an object with a string name and status");
  }

  const extensions = dedupe(
    parseList(document.extensions, "/extensions", warnings, (item, path) => parseExtension(item, path, warnings)),
    "/extensions",
    warnings,
  );
  const presets = parseList(document.presets, "/presets", warnings, (item, path) => parsePreset(item, path, warnings));
  if (presets.length === 0) warnings.push("/presets: the server lists no usable preset");
  else if (presets.filter((preset) => preset.isDefault).length !== 1) {
    warnings.push("/presets: exactly one preset must be the default");
  }

  const listed = new Set(extensions.map(keyOf));
  presets.forEach((preset, index) => {
    for (const extension of preset.extensions) {
      if (!listed.has(keyOf(extension))) {
        warnings.push(`/presets/${index}/extensions: ${keyOf(extension)} is not in the extensions list of the document`);
      }
    }
  });

  const serverDatetime = optionalString(document, "datetime", "", warnings);
  if (serverDatetime === undefined || Number.isNaN(Date.parse(serverDatetime))) {
    warnings.push("/datetime: expected a date-time string");
  }

  const snapshot: CapabilitySnapshot = {
    source,
    versions,
    environment,
    tlds: parseStrings(document.tlds, "/tlds", warnings),
    objects: parseStrings(document.objects, "/objects", warnings),
    extensions,
    presets,
    profiles: parseList(document.profiles, "/profiles", warnings, (item, path) => parseReference(item, path, warnings)),
    serverDatetime,
    raw: document,
  };
  return { snapshot, warnings };
}
