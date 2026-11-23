import { PageHeader, Section } from "@/components/common/layout";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { useSettings } from "@/app/settings-context";

export function SettingsPage() {
  const { settings, update } = useSettings();

  return (
    <>
      <PageHeader title="Settings" description="How this client behaves. The choices are kept in this browser." />

      <Section id="data" title="Data">
        <div className="flex max-w-xl flex-col gap-4">
          <Choice
            type="checkbox"
            label="Synthesize data"
            hint="Screens that support it show examples that this client makes up, and do not ask the server. Nothing is requested and nothing is changed at the registry."
            checked={settings.synthesizeData}
            onChange={(event) => update({ synthesizeData: event.target.checked })}
          />
          <p className="text-sm text-muted-foreground">
            For now this applies to the Messages screen, which then offers two examples of each message type. It is for trying the screens, and for
            demonstrations. Examples are always marked as such.
          </p>
          {settings.synthesizeData && (
            <Callout tone="warning" title="Synthesized data is on">
              What the supporting screens show is made up. It is not what the server holds.
            </Callout>
          )}
        </div>
      </Section>
    </>
  );
}
