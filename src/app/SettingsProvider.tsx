import { useMemo, useState, type ReactNode } from "react";
import { loadSettings, saveSettings, type AppSettings } from "@/config/appSettings";
import { SettingsContext, type SettingsApi } from "./settings-context";

/** Holds the settings of the client and keeps them across visits. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const api = useMemo<SettingsApi>(
    () => ({
      settings,
      update(changes) {
        const next = { ...settings, ...changes };
        setSettings(next);
        saveSettings(next);
      },
    }),
    [settings],
  );

  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>;
}
