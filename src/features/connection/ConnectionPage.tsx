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
      return "Check the address and your network. A browser also refuses answers from a server that does not allow requests from this page (CORS), which looks the same as being offline.";
    case "http":
      return "The address answered, but not with the discovery document. Check that it is the RPP server and not a login or error page.";
    case "content":
    case "invalid-document":
      return "The address answered, but not with an RPP discovery document. Check that the address is the RPP server itself.";
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
      setError("host", { type: "required", message: "Enter the host name of the RPP server" });
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
      setLookup({ status: "failed", message: error instanceof Error ? error.message : "The DNS lookup failed" });
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
        if (field === "host" || field === "port" || field === "username") setError(field, { type: issue.code, message: issue.message });
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
      setError("root", { message: error instanceof Error ? error.message : "The connection could not be set up" });
    }
  });

  const busy = discovery.status === "loading";

  return (
    <>
      <PageHeader
        title="Connection"
        description="Manage RPP server connections."
      />

      <BookmarkBar
        bookmarks={bookmarks}
        pickedId={pickedId}
        activeId={activeId}
        editing={editing}
        onPick={setPickedId}
        onUse={(bookmark) => load(bookmark, false)}
        onEdit={(bookmark) => load(bookmark, true)}
        onDelete={deleteBookmark}
      />

      <Section id="server" title="Server">
        {active && !editing && (
          <Callout title={`Bookmark ${active.name} is in the form`} className="max-w-xl">
            {active.profile.auth.type === "basic" ? "Enter the password and connect." : "Connect when you are ready."}
          </Callout>
        )}
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-6">
          <Field
            label="Connection name"
            hint="Name for connection in your bookmarks. Needed only to save the connection as a bookmark."
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
              label="Server hostname or TLD"
              hint="The host name of the RPP server, for example rpp.example"
              error={errors.host?.message}
              className="flex-1"
            >
              {(control) => (
                <div className="flex gap-2">
                  <Input {...control} inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} {...register("host")} />
                  <Button variant="secondary" title="Perform DNS-based bootstrap" onClick={lookupPort} disabled={lookup.status === "busy"}>
                    {lookup.status === "busy" ? "Looking up" : "Lookup"}
                  </Button>
                </div>
              )}
            </Field>
            <Field label="Port" error={errors.port?.message} className="sm:w-28">
              {(control) => <Input {...control} type="number" inputMode="numeric" min={1} max={65535} {...register("port")} />}
            </Field>
          </div>
          {lookup.status === "done" && (
            <Callout tone={lookup.portFound || lookup.target ? "success" : "info"} title={`Lookup of _rpp.${lookup.queried}`}>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  {lookup.portFound
                    ? `The HTTPS record names port ${lookup.port}.`
                    : `No port was found: no HTTPS record names one. The default port ${lookup.port} is used, or enter another port by hand.`}
                </li>
                <li>
                  {lookup.target
                    ? `The HTTPS record names the target server ${lookup.target}, which now replaces the server address.`
                    : `No target server was found: no HTTPS record names one. The server address stays ${lookup.queried}.`}
                </li>
              </ul>
            </Callout>
          )}
          {lookup.status === "failed" && (
            <Callout tone="warning" title="The port could not be looked up">
              {lookup.message}. Enter the port by hand.
            </Callout>
          )}

          <Choice
            type="checkbox"
            label="Allow plain HTTP"
            hint="For a server on your own machine or network while developing. Everything sent is readable on the way."
            {...register("allowInsecureHttp")}
          />

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-medium">Authentication</legend>
            <Choice type="radio" value="none" label="None" hint="Requests carry no credentials." {...register("authType")} />
            <Choice
              type="radio"
              value="basic"
              label="User name and password"
              hint="HTTP Basic. The password is kept in memory only and is gone when you reload or disconnect."
              {...register("authType")}
            />
          </fieldset>

          {authType === "basic" && (
            <div className="flex flex-col gap-4 border-l-2 border-border pl-5">
              <Field label="User name" error={errors.username?.message}>
                {(control) => <Input {...control} autoComplete="off" spellCheck={false} {...register("username")} />}
              </Field>
              <Field label="Password" error={errors.password?.message}>
                {(control) => <Input {...control} type="password" autoComplete="off" {...register("password")} />}
              </Field>
              {insecureBasic && (
                <Callout tone="warning" title="The password would travel unprotected">
                  Basic authentication over plain HTTP exposes the password to anyone on the network.
                </Callout>
              )}
            </div>
          )}

          {errors.root?.message && (
            <Callout tone="danger" title="The connection could not be set up">
              {errors.root.message}
            </Callout>
          )}

          <fieldset className="flex flex-col gap-3 rounded-md border border-border p-4">
            <legend className="px-1 font-medium">{editing && active ? `Editing bookmark ${active.name}` : "Bookmark"}</legend>
            <p className="text-sm text-muted-foreground">
              Saves the connection name, the address, the authentication and user name, and the preset settings. Not the password.
            </p>
            <div className="flex flex-wrap gap-2">
              {editing && active ? (
                <>
                  <Button variant="secondary" onClick={saveBookmark}>
                    Save changes to the bookmark
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
                    Stop editing
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={saveBookmark}>
                  Save as a bookmark
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
              {session ? "Reconnect" : "Connect"}
            </Button>
            {session && (
              <Button variant="secondary" onClick={disconnect}>
                Disconnect
              </Button>
            )}
          </div>
        </form>
      </Section>

      <Section id="capabilities" title="Capabilities">
        {discovery.status === "not-started" && (
          <EmptyState title="Not connected">
            Connect to read what the server offers.
          </EmptyState>
        )}
        {discovery.status === "loading" && <Callout title="Reading the capabilities of the server" />}
        {discovery.status === "failed" && (
          <Callout tone="danger" title="The capabilities of the server could not be read">
            <p>{discovery.error.message}</p>
            <p className="mt-2">{failureHint(discovery.error)}</p>
          </Callout>
        )}
        {(discovery.status === "ready" || discovery.status === "partial") && session && (
          <>
            <Callout tone={discovery.status === "partial" ? "warning" : "success"} title="Capabilities read">
              {session.authentication.state.status === "credentials-supplied"
                ? `Signing in as ${session.authentication.state.principal}. The server checks the credentials when you first use it.`
                : "Using the server without credentials."}
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
        <Section id="preset" title="Preset" description="Requests name the preset they are made under. Change it here at any time.">
          <PresetPanel snapshot={discovery.snapshot} />
        </Section>
      )}
    </>
  );
}
