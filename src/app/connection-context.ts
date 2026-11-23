import { createContext, useContext } from "react";
import type { ConnectionProfile, Credentials, PresetSettings } from "@/config/connectionProfile";
import type { ResolvedPreset } from "@/application/connection/preset";
import type { Session } from "@/application/connection/session";

export interface ConnectionApi {
  /** The active connection; undefined while disconnected. */
  session: Session | undefined;
  /** The profile of the last connection, also after a reload, for prefilling the form. */
  lastProfile: ConnectionProfile | undefined;
  /** How requests name their preset, and what that comes to on the connected server. */
  presetSettings: PresetSettings;
  resolvedPreset: ResolvedPreset;
  /** Takes effect for the next request and is remembered with the profile. */
  updatePresetSettings(settings: PresetSettings): void;
  /** Throws when the profile and credentials do not fit together. The server is only contacted afterwards. */
  connect(profile: ConnectionProfile, credentials: Credentials | undefined): void;
  disconnect(): void;
}

export const ConnectionContext = createContext<ConnectionApi | undefined>(undefined);

export function useConnection(): ConnectionApi {
  const connection = useContext(ConnectionContext);
  if (!connection) throw new Error("useConnection needs a ConnectionProvider");
  return connection;
}
