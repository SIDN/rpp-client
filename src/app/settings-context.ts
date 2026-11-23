import { createContext, useContext } from "react";
import { DEFAULT_SETTINGS, type AppSettings } from "@/config/appSettings";

export interface SettingsApi {
  settings: AppSettings;
  update(changes: Partial<AppSettings>): void;
}

// Without a provider the defaults hold, so a screen can be shown on its own.
export const SettingsContext = createContext<SettingsApi>({ settings: DEFAULT_SETTINGS, update: () => {} });

export const useSettings = (): SettingsApi => useContext(SettingsContext);
