import type { CapabilitySnapshot, ServerExtension, VersionedReference } from "../discovery/capability-types";
import { advertisedExtensions, defaultPreset, findPreset } from "../discovery/capabilities";
import type { RppExtensionModule } from "./ExtensionModule";
import { DENIC_RRI } from "./modules/denicRri/module";

/** The extension modules compiled into this client. Being listed here makes none of them active. */
export const BUNDLED_EXTENSIONS: readonly RppExtensionModule[] = [DENIC_RRI];

export function findExtensionModule(id: string, modules: readonly RppExtensionModule[] = BUNDLED_EXTENSIONS): RppExtensionModule | undefined {
  return modules.find((module) => module.id === id);
}

export type ExtensionActivation =
  /** Advertised in a supported version, and in effect under the preset requests are made under. */
  | { status: "active"; advertised: ServerExtension }
  /** The server advertises no version of it. */
  | { status: "not-advertised" }
  /** Advertised, but only in versions this client does not implement. */
  | { status: "version-mismatch"; advertised: readonly ServerExtension[]; supportedVersions: readonly string[] }
  /**
   * Advertised in a supported version, but not by the preset in effect (`preset`), or no preset is in effect because
   * the server offers presets but none is chosen and none is its default.
   */
  | { status: "not-in-preset"; advertised: ServerExtension; preset: VersionedReference | undefined };

const supported = (module: RppExtensionModule, extension: ServerExtension) =>
  extension.id === module.id && module.supportedVersions.includes(extension.version);

/**
 * Whether an extension module may be used with a server. The extension has to be advertised in a version the module
 * implements (exact match). A server that offers presets applies the extensions of the preset a request is made under
 * (json, Presets): `preset` is the one requests carry, else the server's default preset is assumed. A server without
 * presets applies what its `extensions` list.
 */
export function activationOf(
  module: RppExtensionModule,
  snapshot: CapabilitySnapshot,
  preset?: VersionedReference,
): ExtensionActivation {
  const advertised = advertisedExtensions(snapshot).filter((extension) => extension.id === module.id);
  if (advertised.length === 0) return { status: "not-advertised" };
  const compatible = advertised.find((extension) => supported(module, extension));
  if (!compatible) return { status: "version-mismatch", advertised, supportedVersions: module.supportedVersions };
  if (snapshot.presets.length === 0) {
    const listed = snapshot.extensions.find((extension) => supported(module, extension));
    return listed ? { status: "active", advertised: listed } : { status: "not-in-preset", advertised: compatible, preset: undefined };
  }
  const inEffect = preset ? findPreset(snapshot, preset.id, preset.version) : defaultPreset(snapshot);
  const effective = inEffect?.extensions.find((extension) => supported(module, extension));
  if (effective) return { status: "active", advertised: effective };
  return { status: "not-in-preset", advertised: compatible, preset: inEffect && { id: inEffect.id, version: inEffect.version } };
}

/** The object types the active modules define, so that they are not shown as unknown to this client. */
export function extensionObjectTypes(
  snapshot: CapabilitySnapshot,
  preset?: VersionedReference,
  modules: readonly RppExtensionModule[] = BUNDLED_EXTENSIONS,
): Map<string, RppExtensionModule> {
  const types = new Map<string, RppExtensionModule>();
  for (const module of modules) {
    if (activationOf(module, snapshot, preset).status !== "active") continue;
    for (const type of module.objects) types.set(type, module);
  }
  return types;
}
