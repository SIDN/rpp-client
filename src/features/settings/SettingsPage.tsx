import { PageHeader, Section } from "@/components/common/layout";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { useSettings } from "@/app/settings-context";
import { t } from "@/i18n";

export function SettingsPage() {
  const { settings, update } = useSettings();

  return (
    <>
      <PageHeader title={t("nav.settings.label")} description={t("settings.description")} />

      <Section id="data" title={t("settings.data.title")}>
        <div className="flex max-w-xl flex-col gap-4">
          <Choice
            type="checkbox"
            label={t("settings.synthesize.label")}
            hint={t("settings.synthesize.hint")}
            checked={settings.synthesizeData}
            onChange={(event) => update({ synthesizeData: event.target.checked })}
          />
          <p className="text-sm text-muted-foreground">
            {t("settings.synthesize.description")}
          </p>
          {settings.synthesizeData && (
            <Callout tone="warning" title={t("settings.synthesize.onTitle")}>
              {t("settings.synthesize.onDescription")}
            </Callout>
          )}
        </div>
      </Section>
    </>
  );
}
