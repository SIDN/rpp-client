import { useConnection } from "@/app/connection-context";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Select } from "@/components/ui/field";
import type { PresetSignallingChoice } from "@/config/connectionProfile";
import type { CapabilitySnapshot } from "@/rpp/discovery/capability-types";
import { defaultPreset } from "@/rpp/discovery/capabilities";
import { t } from "@/i18n";

const DEFAULT = "default";
const MISSING = "missing";

const SIGNALLING: PresetSignallingChoice[] = ["header", "media-type", "none"];

function signallingLabel(value: PresetSignallingChoice): string {
  switch (value) {
    case "header": return t("connection.preset.header");
    case "media-type": return t("connection.preset.mediaType");
    case "none": return t("connection.preset.none");
  }
}

function signallingHint(value: PresetSignallingChoice): string {
  switch (value) {
    case "header": return t("connection.preset.headerHint");
    case "media-type": return t("connection.preset.mediaTypeHint");
    case "none": return t("connection.preset.noneHint");
  }
}

/** Which preset the requests name, and how. It applies from the next request on. */
export function PresetPanel({ snapshot }: { snapshot: CapabilitySnapshot }) {
  const { presetSettings, resolvedPreset, updatePresetSettings } = useConnection();
  const { selection, signalling } = presetSettings;
  const serverDefault = defaultPreset(snapshot);

  const offered = selection === DEFAULT ? true : snapshot.presets.some((preset) => preset.id === selection.id && preset.version === selection.version);
  const value = selection === DEFAULT ? DEFAULT : offered ? `${selection.id}@${selection.version}` : MISSING;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Field label={t("connection.preset.title")} hint={t("connection.preset.fieldHint")}>
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
            <option value={DEFAULT}>{serverDefault ? t("connection.preset.serverDefaultNamed", { id: serverDefault.id }) : t("connection.preset.serverDefault")}</option>
            {snapshot.presets.map((preset) => (
              <option key={`${preset.id}@${preset.version}`} value={`${preset.id}@${preset.version}`}>
                {preset.id}, {t("connection.preset.version", { version: preset.version })}
              </option>
            ))}
            {!offered && selection !== DEFAULT && (
              <option value={MISSING} disabled>
                {t("connection.preset.notOffered", { id: selection.id, version: selection.version })}
              </option>
            )}
          </Select>
        )}
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">{t("connection.preset.signallingLabel")}</legend>
        {SIGNALLING.map((option) => (
          <Choice
            key={option}
            type="radio"
            name="preset-signalling"
            value={option}
            label={signallingLabel(option)}
            hint={signallingHint(option)}
            checked={signalling === option}
            onChange={() => updatePresetSettings({ ...presetSettings, signalling: option })}
          />
        ))}
        <p className="text-sm text-muted-foreground">
          {t("connection.preset.discoveryHint")}
        </p>
      </fieldset>

      {resolvedPreset.problem && (
        <Callout tone="warning" title={t("connection.preset.notSent")}>
          {resolvedPreset.problem}
        </Callout>
      )}
      {resolvedPreset.sent && (
        <p>
          {t("connection.preset.requestsCarry")} <code className="break-all">{resolvedPreset.sent}</code>
        </p>
      )}
      {!resolvedPreset.sent && !resolvedPreset.problem && <p className="text-muted-foreground">{t("connection.preset.noPresetCarried")}</p>}
    </div>
  );
}
