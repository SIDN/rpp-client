import { useState } from "react";
import { Link } from "react-router-dom";
import { useSettings } from "@/app/settings-context";
import { MESSAGE_LIMITS } from "@/application/messages/messages";
import { PAGE_SIZES } from "@/application/processes/processList";
import { PageHeader, Section } from "@/components/common/layout";
import { PaletteChoice } from "@/components/common/PaletteChoice";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input, Select } from "@/components/ui/field";
import { TIMEOUT_SECONDS, type TimeDisplay } from "@/config/appSettings";
import { loadBookmarks } from "@/config/bookmarks";
import { defaultBookmark } from "@/config/defaultConnection";
import { getLocale, LOCALES, setLocale, t, type LocaleId } from "@/i18n";

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseTimeout(value: string): number | undefined {
  const seconds = Number(value);
  return value.trim() !== "" && Number.isInteger(seconds) && seconds >= TIMEOUT_SECONDS.min && seconds <= TIMEOUT_SECONDS.max ? seconds : undefined;
}

/** The options of the person using this client: which connection to start with, and how screens show things. */
export function ClientPage() {
  const { settings, update } = useSettings();
  const [bookmarks] = useState(() => loadBookmarks());
  const chosen = defaultBookmark(settings, bookmarks);
  const needsPassword = chosen?.profile.auth.type === "basic";
  const [doh, setDoh] = useState(settings.dohEndpoint);
  const [timeout, setTimeoutText] = useState(String(settings.requestTimeoutSeconds));
  const timeoutError = parseTimeout(timeout) === undefined ? t("client.timeout.invalid", { min: TIMEOUT_SECONDS.min, max: TIMEOUT_SECONDS.max }) : undefined;
  const dohError = isHttpsUrl(doh.trim()) ? undefined : t("client.dns.invalid");

  return (
    <>
      <PageHeader title={t("client.page.title")} description={t("client.page.description")} />

      <Section id="connection" title={t("client.connection.title")}>
        <div className="flex max-w-xl flex-col gap-6">
          <Field label={t("client.connection.default")} hint={t("client.connection.defaultHint")}>
            {(control) => (
              <Select
                {...control}
                value={chosen?.id ?? ""}
                disabled={bookmarks.length === 0}
                onChange={(event) => update({ defaultBookmarkId: event.target.value === "" ? undefined : event.target.value })}
              >
                <option value="">{bookmarks.length === 0 ? t("client.connection.empty") : t("client.connection.none")}</option>
                {bookmarks.map((bookmark) => (
                  <option key={bookmark.id} value={bookmark.id}>
                    {bookmark.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {bookmarks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("client.connection.saveLinkStart")} <Link to="/connection" className="underline">{t("client.connection.screenLink")}</Link> {t("client.connection.saveLinkEnd")}
            </p>
          )}
          {chosen && (
            <p className="text-sm text-muted-foreground">
              <code>{chosen.profile.baseUrl}</code>, {chosen.profile.auth.type === "basic" ? t("client.connection.user", { username: chosen.profile.auth.username }) : t("client.connection.noAuthentication")}.
            </p>
          )}
          <Field label={t("client.timeout.label")} hint={t("client.timeout.hint")} error={timeoutError}>
            {(control) => (
              <Input
                {...control}
                type="number"
                inputMode="numeric"
                min={TIMEOUT_SECONDS.min}
                max={TIMEOUT_SECONDS.max}
                step={1}
                className="max-w-32"
                value={timeout}
                onChange={(event) => {
                  setTimeoutText(event.target.value);
                  const seconds = parseTimeout(event.target.value);
                  if (seconds !== undefined) update({ requestTimeoutSeconds: seconds });
                }}
                onBlur={() => {
                  if (parseTimeout(timeout) === undefined) setTimeoutText(String(settings.requestTimeoutSeconds));
                }}
              />
            )}
          </Field>
          <Choice
            type="checkbox"
            label={t("client.autoConnect.label")}
            hint={t("client.autoConnect.hint")}
            checked={settings.autoConnect}
            disabled={chosen === undefined}
            onChange={(event) => update({ autoConnect: event.target.checked })}
          />
          {settings.autoConnect && needsPassword && (
            <Callout tone="warning" title={t("client.autoConnect.passwordTitle")}>
              {t("client.autoConnect.passwordHint")}
            </Callout>
          )}
        </div>
      </Section>

      <Section id="dns" title={t("client.dns.title")}>
        <div className="flex max-w-xl flex-col gap-6">
          <Field
            label={t("client.dns.server")}
            hint={t("client.dns.serverHint")}
            error={dohError}
          >
            {(control) => (
              <Input
                {...control}
                type="url"
                spellCheck={false}
                value={doh}
                onChange={(event) => {
                  setDoh(event.target.value);
                  const value = event.target.value.trim();
                  if (isHttpsUrl(value)) update({ dohEndpoint: value });
                }}
                onBlur={() => {
                  if (!isHttpsUrl(doh.trim())) setDoh(settings.dohEndpoint);
                }}
              />
            )}
          </Field>
        </div>
      </Section>

      <Section id="display" title={t("client.display.title")}>
        <div className="flex max-w-xl flex-col gap-6">
          <Field label={t("client.language.label")} hint={t("client.language.hint")}>
            {(control) => (
              <Select {...control} value={getLocale()} onChange={(event) => setLocale(event.target.value as LocaleId)}>
                {LOCALES.map((locale) => (
                  <option key={locale.id} value={locale.id} lang={locale.id}>
                    {locale.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <PaletteChoice />
          <Field label={t("client.display.timeZone")} hint={t("client.display.timeZoneHint")}>
            {(control) => (
              <Select {...control} value={settings.timeDisplay} onChange={(event) => update({ timeDisplay: event.target.value as TimeDisplay })}>
                <option value="local">{t("client.display.localTime")}</option>
                <option value="utc">{t("client.display.utc")}</option>
              </Select>
            )}
          </Field>
          <Field label={t("client.display.messageLimit")} hint={t("client.display.messageLimitHint")}>
            {(control) => (
              <Select {...control} value={settings.messageLimit} onChange={(event) => update({ messageLimit: Number(event.target.value) })}>
                {MESSAGE_LIMITS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("client.display.processPageSize")} hint={t("client.display.processPageSizeHint")}>
            {(control) => (
              <Select {...control} value={settings.processPageSize} onChange={(event) => update({ processPageSize: Number(event.target.value) })}>
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Section>
    </>
  );
}
