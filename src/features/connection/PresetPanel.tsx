import { useConnection } from "@/app/connection-context";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Select } from "@/components/ui/field";
import type { PresetSignallingChoice } from "@/config/connectionProfile";
import type { CapabilitySnapshot } from "@/rpp/discovery/capability-types";
import { defaultPreset } from "@/rpp/discovery/capabilities";

const DEFAULT = "default";
const MISSING = "missing";

const SIGNALLING: { value: PresetSignallingChoice; label: string; hint: string }[] = [
  { value: "header", label: "RPP-Preset header", hint: "One header field on every request." },
  { value: "media-type", label: "Media type parameters", hint: "preset and preset-version on Accept and Content-Type." },
  { value: "none", label: "Do not send a preset", hint: "The server applies its own default." },
];

/** Which preset the requests name, and how. It applies from the next request on. */
export function PresetPanel({ snapshot }: { snapshot: CapabilitySnapshot }) {
  const { presetSettings, resolvedPreset, updatePresetSettings } = useConnection();
  const { selection, signalling } = presetSettings;
  const serverDefault = defaultPreset(snapshot);

  const offered = selection === DEFAULT ? true : snapshot.presets.some((preset) => preset.id === selection.id && preset.version === selection.version);
  const value = selection === DEFAULT ? DEFAULT : offered ? `${selection.id}@${selection.version}` : MISSING;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Field label="Preset" hint="The set of extensions and constraints that requests are made under.">
        {(control) => (
          <Select
            {...control}
            value={value}
            onChange={(event) => {
              const next = event.target.value;
              if (next === MISSING) return;
              if (next === DEFAULT) return updatePresetSettings({ ...presetSettings, selection: DEFAULT });
              const preset = snapshot.presets.find((candidate) => `${candidate.id}@${candidate.version}` === next);
              if (preset) updatePresetSettings({ ...presetSettings, selection: { id: preset.id, version: preset.version } });
            }}
          >
            <option value={DEFAULT}>{serverDefault ? `Server default (${serverDefault.id})` : "Server default"}</option>
            {snapshot.presets.map((preset) => (
              <option key={`${preset.id}@${preset.version}`} value={`${preset.id}@${preset.version}`}>
                {preset.id}, version {preset.version}
              </option>
            ))}
            {!offered && selection !== DEFAULT && (
              <option value={MISSING} disabled>
                Not offered: {selection.id}, version {selection.version}
              </option>
            )}
          </Select>
        )}
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">Signal the preset with</legend>
        {SIGNALLING.map((option) => (
          <Choice
            key={option.value}
            type="radio"
            name="preset-signalling"
            value={option.value}
            label={option.label}
            hint={option.hint}
            checked={signalling === option.value}
            onChange={() => updatePresetSettings({ ...presetSettings, signalling: option.value })}
          />
        ))}
        <p className="text-sm text-muted-foreground">
          Discovery does not say which method a server accepts. If it refuses requests because of the preset, try the other one.
        </p>
      </fieldset>

      {resolvedPreset.problem && (
        <Callout tone="warning" title="No preset is sent">
          {resolvedPreset.problem}
        </Callout>
      )}
      {resolvedPreset.sent && (
        <p>
          Requests carry <code className="break-all">{resolvedPreset.sent}</code>
        </p>
      )}
      {!resolvedPreset.sent && !resolvedPreset.problem && <p className="text-muted-foreground">Requests carry no preset.</p>}
    </div>
  );
}
