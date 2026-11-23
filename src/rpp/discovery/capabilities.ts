import type { CapabilitySnapshot, PresetCapability, ServerExtension, ServerVersion, VersionedReference } from "./capability-types";

const sameReference = (a: VersionedReference, b: VersionedReference) => a.id === b.id && a.version === b.version;

/** The extensions the document lists plus those only its presets list, once per identifier and version. */
export function advertisedExtensions(snapshot: CapabilitySnapshot): ServerExtension[] {
  const result = [...snapshot.extensions];
  for (const extension of snapshot.presets.flatMap((preset) => preset.extensions)) {
    if (!result.some((known) => sameReference(known, extension))) result.push(extension);
  }
  return result;
}

/** Without a version, the first preset of that identifier. */
export function findPreset(snapshot: CapabilitySnapshot, id: string, version?: string): PresetCapability | undefined {
  return snapshot.presets.find((preset) => preset.id === id && (version === undefined || preset.version === version));
}

/** Undefined unless the document marks exactly one preset as default. */
export function defaultPreset(snapshot: CapabilitySnapshot): PresetCapability | undefined {
  const defaults = snapshot.presets.filter((preset) => preset.isDefault);
  return defaults.length === 1 ? defaults[0] : undefined;
}

/**
 * The extensions in effect under a preset (exact identifier and version), or the default preset when none is given.
 * Undefined when the server does not offer that preset.
 */
export function extensionsOfPreset(snapshot: CapabilitySnapshot, preset?: VersionedReference): ServerExtension[] | undefined {
  const offered = preset ? findPreset(snapshot, preset.id, preset.version) : defaultPreset(snapshot);
  return offered?.extensions;
}

export function supportsObject(snapshot: CapabilitySnapshot, objectType: string): boolean {
  return snapshot.objects.includes(objectType);
}

export function findVersion(snapshot: CapabilitySnapshot, version: string): ServerVersion | undefined {
  return snapshot.versions.find((entry) => entry.version === version);
}
