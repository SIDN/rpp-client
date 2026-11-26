import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { resolvePreset } from "@/application/connection/preset";
import { createSession, type Session } from "@/application/connection/session";
import { loadSettings } from "@/config/appSettings";
import { useSettings } from "./settings-context";
import { autoConnectProfile } from "@/config/defaultConnection";
import {
  DEFAULT_PRESET_SETTINGS,
  loadProfile,
  saveProfile,
  type ConnectionProfile,
  type Credentials,
  type PresetSettings,
} from "@/config/connectionProfile";
import type { DiscoveryState } from "@/rpp/discovery/capability-types";
import { DiscoveryError } from "@/rpp/errors/DiscoveryError";
import { ConnectionContext, type ConnectionApi } from "./connection-context";
import { DiscoveryContext } from "./discovery-context";
import { useDraftStore } from "./draft-context";
import { KEPT_OBJECT_ROOTS } from "@/features/shared/seenObjects";

const DISCOVERY_KEY = "discovery";

function asDiscoveryError(error: unknown): DiscoveryError {
  return error instanceof DiscoveryError
    ? error
    : new DiscoveryError("transport", error instanceof Error ? error.message : String(error), { cause: error });
}

/** Holds the active session and reads its capabilities; the rest of the app only sees the resulting state. */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  // The transport asks for the timeout on every request, so a change applies to the open connection too.
  const timeoutSeconds = useRef(settings.requestTimeoutSeconds);
  useEffect(() => {
    timeoutSeconds.current = settings.requestTimeoutSeconds;
  }, [settings.requestTimeoutSeconds]);
  const timeoutMs = useCallback(() => timeoutSeconds.current * 1000, []);
  // A default bookmark without a password can be connected to when the client starts, if that is chosen.
  const [startup] = useState(() => {
    const profile = autoConnectProfile(loadSettings());
    try {
      return profile && { profile, session: createSession(profile, undefined, { timeoutMs }) };
    } catch {
      return undefined;
    }
  });
  const [session, setSession] = useState<Session | undefined>(startup?.session);
  const [lastProfile, setLastProfile] = useState(() => startup?.profile ?? loadProfile());
  const [presetSettings, setPresetSettings] = useState<PresetSettings>(() => lastProfile?.preset ?? DEFAULT_PRESET_SETTINGS);

  // The key holds no address and no credential, only the number of the connection.
  const discovery = useQuery({
    queryKey: [DISCOVERY_KEY, session?.id],
    queryFn: ({ signal }) => (session as Session).discovery.discover({ signal }),
    enabled: session !== undefined,
    staleTime: Infinity,
  });

  const state: DiscoveryState = !session
    ? { status: "not-started" }
    : discovery.isError
      ? { status: "failed", error: asDiscoveryError(discovery.error) }
      : discovery.data ?? { status: "loading" };

  const snapshot = state.status === "ready" || state.status === "partial" ? state.snapshot : undefined;
  const resolvedPreset = useMemo(() => resolvePreset(presetSettings, snapshot), [presetSettings, snapshot]);

  // Work in progress and the objects seen belong to one connection; those of another are dropped, typed passwords too.
  // This runs after the screens of the old connection have put their drafts away.
  const drafts = useDraftStore();
  const sessionId = session?.id;
  useEffect(() => {
    drafts.retain(sessionId);
    queryClient.removeQueries({
      predicate: (query) => (KEPT_OBJECT_ROOTS as readonly unknown[]).includes(query.queryKey[0]) && query.queryKey[1] !== sessionId,
    });
  }, [drafts, queryClient, sessionId]);

  // The session is an external object the transport reads on every request.
  useEffect(() => {
    session?.setPreset(resolvedPreset.preset);
  }, [session, resolvedPreset.preset]);

  const api = useMemo<ConnectionApi>(
    () => ({
      session,
      lastProfile,
      presetSettings,
      resolvedPreset,
      connect(profile: ConnectionProfile, credentials: Credentials | undefined) {
        const next = createSession(profile, credentials, { timeoutMs });
        session?.authentication.clearSession();
        saveProfile(profile);
        setLastProfile(profile);
        setPresetSettings(profile.preset);
        setSession(next);
      },
      updatePresetSettings(settings: PresetSettings) {
        setPresetSettings(settings);
        const profile = session?.profile ?? lastProfile;
        if (profile) {
          const updated = { ...profile, preset: settings };
          saveProfile(updated);
          setLastProfile(updated);
        }
      },
      disconnect() {
        session?.authentication.clearSession();
        queryClient.removeQueries({ queryKey: [DISCOVERY_KEY] });
        setSession(undefined);
      },
    }),
    [session, lastProfile, presetSettings, resolvedPreset, queryClient, timeoutMs],
  );

  return (
    <ConnectionContext.Provider value={api}>
      <DiscoveryContext.Provider value={state}>{children}</DiscoveryContext.Provider>
    </ConnectionContext.Provider>
  );
}
