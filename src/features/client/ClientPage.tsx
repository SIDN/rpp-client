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
  const timeoutError = parseTimeout(timeout) === undefined ? `Enter a whole number of seconds, ${TIMEOUT_SECONDS.min} to ${TIMEOUT_SECONDS.max}` : undefined;
  const dohError = isHttpsUrl(doh.trim()) ? undefined : "Enter an https:// address";

  return (
    <>
      <PageHeader title="Client" description="Your options for this client. They are kept in this browser, and never include a password or token." />

      <Section id="connection" title="Connection">
        <div className="flex max-w-xl flex-col gap-6">
          <Field label="Default connection" hint="The bookmark the Connection screen starts with. Bookmarks are saved on the Connection screen.">
            {(control) => (
              <Select
                {...control}
                value={chosen?.id ?? ""}
                disabled={bookmarks.length === 0}
                onChange={(event) => update({ defaultBookmarkId: event.target.value === "" ? undefined : event.target.value })}
              >
                <option value="">{bookmarks.length === 0 ? "No bookmarks yet" : "None"}</option>
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
              Save a connection as a bookmark on the <Link to="/connection" className="underline">Connection screen</Link> to choose it here.
            </p>
          )}
          {chosen && (
            <p className="text-sm text-muted-foreground">
              <code>{chosen.profile.baseUrl}</code>, {chosen.profile.auth.type === "basic" ? `user ${chosen.profile.auth.username}` : "no authentication"}.
            </p>
          )}
          <Field label="Timeout (seconds)" hint="How long to wait for the answer to any request to the RPP server before giving up. Applies to the open connection too." error={timeoutError}>
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
            label="Connect when the client starts"
            hint="Connects to the default connection as soon as this page is opened."
            checked={settings.autoConnect}
            disabled={chosen === undefined}
            onChange={(event) => update({ autoConnect: event.target.checked })}
          />
          {settings.autoConnect && needsPassword && (
            <Callout tone="warning" title="This connection needs a password">
              Passwords are never kept, so the client cannot connect by itself. It fills in the connection and waits for you to enter the password.
            </Callout>
          )}
        </div>
      </Section>

      <Section id="dns" title="DNS">
        <div className="flex max-w-xl flex-col gap-6">
          <Field
            label="DNS-over-HTTPS server"
            hint="Used by Lookup on the Connection screen to read the HTTPS record of a server. It sees the host names you look up. It must offer the JSON API."
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

      <Section id="display" title="Display">
        <div className="flex max-w-xl flex-col gap-6">
          <PaletteChoice />
          <Field label="Time zone" hint="Dates and times are always sent and kept as the server gives them. This is how they are shown.">
            {(control) => (
              <Select {...control} value={settings.timeDisplay} onChange={(event) => update({ timeDisplay: event.target.value as TimeDisplay })}>
                <option value="local">This computer</option>
                <option value="utc">UTC</option>
              </Select>
            )}
          </Field>
          <Field label="Messages shown to begin with" hint="On the Messages screen. You can still change it there.">
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
          <Field label="Processes per page" hint="On the Processes screen. You can still change it there.">
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
