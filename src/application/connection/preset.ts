import type { PresetSettings } from "@/config/connectionProfile";
import { buildContentType, buildPresetHeaderValue, PRESET_HEADER, type PresetSignalling } from "@/rpp/client/negotiation";
import type { CapabilitySnapshot, PresetCapability } from "@/rpp/discovery/capability-types";
import { defaultPreset, findPreset } from "@/rpp/discovery/capabilities";

export interface ResolvedPreset {
  /** What requests carry; undefined when nothing can or should be sent. */
  preset: PresetSignalling | undefined;
  /** The preset the settings point at on this server, also when it cannot be signalled. */
  chosen: PresetCapability | undefined;
  /** Why nothing is sent although something was asked for. */
  problem: string | undefined;
  /** What a request carries, for display. */
  sent: string | undefined;
}

const NOTHING: ResolvedPreset = { preset: undefined, chosen: undefined, problem: undefined, sent: undefined };

/** Applies the settings to what the server offers. Without a read discovery document nothing is sent. */
export function resolvePreset(settings: PresetSettings, snapshot: CapabilitySnapshot | undefined): ResolvedPreset {
  if (!snapshot || settings.signalling === "none") return NOTHING;

  const chosen = settings.selection === "default" ? defaultPreset(snapshot) : findPreset(snapshot, settings.selection.id, settings.selection.version);
  if (!chosen) {
    return {
      ...NOTHING,
      problem:
        settings.selection === "default"
          ? "The server does not mark exactly one preset as its default, so none is sent. Choose a preset."
          : `The server does not offer ${settings.selection.id} version ${settings.selection.version}, so no preset is sent.`,
    };
  }

  const preset: PresetSignalling = { method: settings.signalling, id: chosen.id, version: chosen.version };
  try {
    buildPresetHeaderValue(preset);
  } catch (error) {
    return { ...NOTHING, chosen, problem: `${(error as Error).message}. No preset is sent.` };
  }
  const sent =
    preset.method === "header"
      ? `${PRESET_HEADER}: ${buildPresetHeaderValue(preset)}`
      : `Accept and Content-Type: ${buildContentType(preset)}`;
  return { preset, chosen, problem: undefined, sent };
}
