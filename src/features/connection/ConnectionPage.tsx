import { useRef, useState } from "react";
import { useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form";
import { useDiscoveryState } from "@/app/discovery-context";
import { useConnection } from "@/app/connection-context";
import { useSettings } from "@/app/settings-context";
import { EmptyState, PageHeader, Section } from "@/components/common/layout";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import {
  bookmarkNameProblem,
  findByName,
  loadBookmarks,
  removeBookmark,
  saveBookmarks,
  storeBookmark,
  type Bookmark,
} from "@/config/bookmarks";
import { connectionFormSchema, toConnection, toFormValues, type ConnectionFormValues, type ConnectionProfile, type PresetSettings } from "@/config/connectionProfile";
import { env } from "@/config/env";
import { lookupRppPort } from "@/rpp/discovery/lookupPort";
import { defaultBookmark } from "@/config/defaultConnection";
import type { DiscoveryError } from "@/rpp/errors/DiscoveryError";
import { t } from "@/i18n";
import { BookmarkBar } from "./BookmarkBar";
import { CapabilitySummary } from "./CapabilitySummary";
import { OverwriteConfirm } from "./OverwriteConfirm";
import { PresetPanel } from "./PresetPanel";

const resolver: Resolver<ConnectionFormValues> = async (values) => {
  const result = connectionFormSchema.safeParse(values);
  if (result.success) return { values: result.data, errors: {} };
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0]);
    errors[field] ??= { type: issue.code, message: issue.message };
  }
  return { values: {}, errors: errors as FieldErrors<ConnectionFormValues> };
};

function failureHint(error: DiscoveryError): string {
  switch (error.kind) {
    case "transport":
      return t("connection.discovery.transportHint");
    case "http":
      return t("connection.discovery.httpHint");
    case "content":
    case "invalid-document":
      return t("connection.discovery.documentHint");
  }
}

export function ConnectionPage() {
  const { session, lastProfile, presetSettings, connect, disconnect } = useConnection();
  const { settings } = useSettings();
  const discovery = useDiscoveryState();
  const [bookmarks, setBookmarks] = useState(() => loadBookmarks());
  // The default connection fills the form when nothing is connected; a connection that is up shows itself.
  const [initial] = useState(() => (session ? undefined : defaultBookmark(settings, bookmarks)));
  const {
    register,
    handleSubmit,
    control: formControl,
    setValue,
    setError,
    clearErrors,
    setFocus,
    reset,
    getValues,
    formState: { errors },
  } = useForm<ConnectionFormValues>({
    resolver,
    defaultValues: initial ? toFormValues(initial.profile) : toFormValues(lastProfile, env.defaultBaseUrl),
  });

  const authType = useWatch({ control: formControl, name: "authType" });
  const allowInsecureHttp = useWatch({ control: formControl, name: "allowInsecureHttp" });
  const insecureBasic = authType === "basic" && allowInsecureHttp;
  const [lookup, setLookup] = useState<
    { status: "idle" | "busy" } | { status: "done"; queried: string; port: number; portFound: boolean; target: string | undefined } | { status: "failed"; message: string }
  >({ status: "idle" });

  const lookupPort = async () => {
    const host = getValues("host").trim();
    if (host === "") {
      setError("host", { type: "required", message: t("config.connection.hostRequired") });
      return;
    }
    setLookup({ status: "busy" });
    try {
      const result = await lookupRppPort(host, { endpoint: settings.dohEndpoint });
      if (result.target) setValue("host", result.target, { shouldDirty: true });
      setValue("port", String(result.port), { shouldDirty: true });
      clearErrors("port");
      setLookup({ status: "done", queried: host, port: result.port, portFound: result.portFound, target: result.target });
    } catch (error) {
      setLookup({ status: "failed", message: error instanceof Error ? error.message : t("connection.server.dnsLookupFailed") });
    }
  };

  const [activeId, setActiveId] = useState<string | undefined>(initial?.id);
  const [pickedId, setPickedId] = useState<string | undefined>(initial?.id);
  const [editing, setEditing] = useState(false);
  const [bookmarkName, setBookmarkName] = useState(initial?.name ?? "");
  const [nameError, setNameError] = useState<string>();
  // A save that would replace another bookmark waits here for an answer; it holds the form as it was when asked.
  const [overwrite, setOverwrite] = useState<{ existing: string; entry: { name: string; profile: ConnectionProfile }; editingId: string | undefined }>();
  const nameInput = useRef<HTMLInputElement>(null);
  const active = bookmarks.find((bookmark) => bookmark.id === activeId);

  const commit = (next: Bookmark[]) => {
    saveBookmarks(next);
    setBookmarks(next);
  };

  // A preset chosen on one server means nothing on another, but a bookmark of the server brings its own.
  const presetFor = (address: string): PresetSettings => {
    if (active?.profile.baseUrl === address) return active.profile.preset;
    return lastProfile?.baseUrl === address ? presetSettings : { ...presetSettings, selection: "default" };
  };

  const load = (bookmark: Bookmark, edit: boolean) => {
    reset({ ...toFormValues(bookmark.profile), password: "" });
    setActiveId(bookmark.id);
    setPickedId(bookmark.id);
    setEditing(edit);
    setBookmarkName(bookmark.name);
    setNameError(undefined);
    setOverwrite(undefined);
    // The fields have to be on screen before one can take the focus.
    setTimeout(() => {
      if (edit) nameInput.current?.focus();
      else if (bookmark.profile.auth.type === "basic") setFocus("password");
    });
  };

  /** The profile the form describes, for a bookmark: it needs no password, so the form is checked with a stand-in. */
  const profileOfForm = (): ConnectionProfile | undefined => {
    const values = getValues();
    const result = connectionFormSchema.safeParse({ ...values, password: "x" });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field === "host" || field === "port" || field === "username" || field === "organisation") setError(field, { type: issue.code, message: issue.message });
      }
      return undefined;
    }
    const first = toConnection(result.data).profile;
    return { ...first, preset: presetFor(first.baseUrl) };
  };

  const persist = (entry: { name: string; profile: ConnectionProfile }, editingId: string | undefined) => {
    const stored = storeBookmark(bookmarks, entry, editingId);
    commit(stored.bookmarks);
    setActiveId(stored.saved.id);
    setPickedId(stored.saved.id);
    setEditing(false);
    setBookmarkName(stored.saved.name);
    setOverwrite(undefined);
  };

  const saveBookmark = () => {
    const problem = bookmarkNameProblem(bookmarkName);
    setNameError(problem);
    const profile = profileOfForm();
    if (problem || !profile) return;
    const editingId = editing ? active?.id : undefined;
    const entry = { name: bookmarkName, profile };
    const existing = findByName(bookmarks, bookmarkName, editingId);
    if (existing) setOverwrite({ existing: existing.name, entry, editingId });
    else persist(entry, editingId);
  };

  const deleteBookmark = (bookmark: Bookmark) => {
    commit(removeBookmark(bookmarks, bookmark.id));
    if (bookmark.id === pickedId) setPickedId(undefined);
    if (bookmark.id !== activeId) return;
    setActiveId(undefined);
    setEditing(false);
    setBookmarkName("");
    setOverwrite(undefined);
  };

  const submit = handleSubmit((values) => {
    const { profile, credentials } = toConnection(values);
    try {
      connect({ ...profile, preset: presetFor(profile.baseUrl) }, credentials);
      setValue("password", "");
    } catch (error) {
      setError("root", { message: error instanceof Error ? error.message : t("connection.server.setupFailed") });
    }
  });

  const busy = discovery.status === "loading";

  return (
    <>
      <PageHeader
        title={t("connection.page.title")}
        description={t("connection.page.description")}
      />

      <BookmarkBar
        bookmarks={bookmarks}
        pickedId={pickedId}
        onPick={setPickedId}
        onUse={(bookmark) => load(bookmark, false)}
        onEdit={(bookmark) => load(bookmark, true)}
        onDelete={deleteBookmark}
      />

      <section id="server" aria-label={t("connection.server.title")} className="flex flex-col gap-4">
        {active && !editing && (
          <Callout title={t("connection.bookmark.inForm", { name: active.name })} className="max-w-xl">
            {active.profile.auth.type === "basic" ? t("connection.bookmark.passwordNeeded") : t("connection.bookmark.ready")}
          </Callout>
        )}
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
          <Field
            label={t("connection.bookmark.name")}
            hint={t("connection.bookmark.nameHint")}
            error={nameError}
          >
            {(control) => (
              <Input
                {...control}
                ref={nameInput}
                value={bookmarkName}
                onChange={(event) => setBookmarkName(event.target.value)}
                autoComplete="off"
              />
            )}
          </Field>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Field
              label={t("connection.server.host")}
              hint={t("connection.server.hostHint")}
              error={errors.host?.message}
              className="flex-1"
            >
              {(control) => (
                <div className="flex gap-2">
                  <Input {...control} inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} {...register("host")} />
                  <Button variant="secondary" title={t("connection.server.lookupTitle")} onClick={lookupPort} disabled={lookup.status === "busy"}>
                    {lookup.status === "busy" ? t("connection.server.lookingUp") : t("connection.server.lookup")}
                  </Button>
                </div>
              )}
            </Field>
            <Field label={t("connection.server.port")} error={errors.port?.message} className="sm:w-28">
              {(control) => <Input {...control} type="number" inputMode="numeric" min={1} max={65535} {...register("port")} />}
            </Field>
          </div>
          {lookup.status === "done" && (
            <Callout tone={lookup.portFound || lookup.target ? "success" : "info"} title={t("connection.server.lookupResult", { host: lookup.queried })}>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  {lookup.portFound
                    ? t("connection.server.httpsPortFound", { port: lookup.port })
                    : t("connection.server.httpsPortMissing", { port: lookup.port })}
                </li>
                <li>
                  {lookup.target
                    ? t("connection.server.httpsTargetFound", { target: lookup.target })
                    : t("connection.server.httpsTargetMissing", { host: lookup.queried })}
                </li>
              </ul>
            </Callout>
          )}
          {lookup.status === "failed" && (
            <Callout tone="warning" title={t("connection.server.lookupFailed")}>
              {lookup.message}. {t("connection.server.enterPortManually")}
            </Callout>
          )}

          <Choice
            type="checkbox"
            label={t("connection.server.plainHttp")}
            hint={t("connection.server.plainHttpHint")}
            {...register("allowInsecureHttp")}
          />

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-medium">{t("connection.server.authentication")}</legend>
            <Choice type="radio" value="none" label={t("connection.server.authNone")} hint={t("connection.server.authNoneHint")} {...register("authType")} />
            <Choice
              type="radio"
              value="basic"
              label={t("connection.server.authBasic")}
              hint={t("connection.server.authBasicHint")}
              {...register("authType")}
            />
          </fieldset>

          {authType === "basic" && (
            <div className="flex flex-col gap-4 border-l-2 border-border pl-5">
              <Field label={t("connection.server.username")} error={errors.username?.message}>
                {(control) => <Input {...control} autoComplete="off" spellCheck={false} {...register("username")} />}
              </Field>
              <Field label={t("connection.server.organisation")} hint={t("connection.server.organisationHint")} error={errors.organisation?.message}>
                {(control) => <Input {...control} autoComplete="off" spellCheck={false} {...register("organisation")} />}
              </Field>
              <Field label={t("connection.server.password")} error={errors.password?.message}>
                {(control) => <Input {...control} type="password" autoComplete="off" {...register("password")} />}
              </Field>
              {insecureBasic && (
                <Callout tone="warning" title={t("connection.server.passwordUnprotected")}>
                  {t("connection.server.passwordExposure")}
                </Callout>
              )}
            </div>
          )}

          {errors.root?.message && (
            <Callout tone="danger" title={t("connection.server.setupFailed")}>
              {errors.root.message}
            </Callout>
          )}

          <fieldset className="flex flex-col gap-3 rounded-md border border-border p-4">
            <legend className="px-1 font-medium">{editing && active ? t("connection.bookmark.editingName", { name: active.name }) : t("connection.bookmark.title")}</legend>
            <p className="text-sm text-muted-foreground">
              {t("connection.bookmark.saveExplanation")}
            </p>
            <div className="flex flex-wrap gap-2">
              {editing && active ? (
                <>
                  <Button variant="secondary" onClick={saveBookmark}>
                    {t("connection.bookmark.saveChanges")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(false);
                      setBookmarkName(active.name);
                      setNameError(undefined);
                      setOverwrite(undefined);
                    }}
                  >
                    {t("connection.bookmark.stopEditing")}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={saveBookmark}>
                  {t("connection.bookmark.save")}
                </Button>
              )}
            </div>
            {overwrite && (
              <OverwriteConfirm
                name={overwrite.existing}
                onConfirm={() => persist(overwrite.entry, overwrite.editingId)}
                onCancel={() => setOverwrite(undefined)}
              />
            )}
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {session ? t("connection.server.reconnect") : t("connection.server.connect")}
            </Button>
            {session && (
              <Button variant="secondary" onClick={disconnect}>
                {t("connection.server.disconnect")}
              </Button>
            )}
          </div>
        </form>
      </section>

      <Section id="capabilities" title={t("connection.capabilities.title")}>
        {discovery.status === "not-started" && (
          <EmptyState title={t("connection.capabilities.notConnected")}>
            {t("connection.capabilities.connectToRead")}
          </EmptyState>
        )}
        {discovery.status === "loading" && <Callout title={t("connection.capabilities.reading")} />}
        {discovery.status === "failed" && (
          <Callout tone="danger" title={t("connection.capabilities.readFailed")}>
            <p>{discovery.error.message}</p>
            <p className="mt-2">{failureHint(discovery.error)}</p>
          </Callout>
        )}
        {(discovery.status === "ready" || discovery.status === "partial") && session && (
          <>
            <Callout tone={discovery.status === "partial" ? "warning" : "success"} title={t("connection.capabilities.read")}>
              {session.authentication.state.status === "credentials-supplied"
                ? t("connection.capabilities.credentialsSupplied", { principal: session.authentication.state.principal })
                : t("connection.capabilities.withoutCredentials")}
            </Callout>
            <CapabilitySummary
              snapshot={discovery.snapshot}
              configuredBaseUrl={session.profile.baseUrl}
              warnings={discovery.status === "partial" ? discovery.warnings : []}
            />
          </>
        )}
      </Section>

      {(discovery.status === "ready" || discovery.status === "partial") && session && (
        <Section id="preset" title={t("connection.preset.title")} description={t("connection.preset.description")}>
          <PresetPanel snapshot={discovery.snapshot} />
        </Section>
      )}
    </>
  );
}
