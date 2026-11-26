import { DEFAULT_PALETTE_ID, isPaletteId } from "./palettes";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "rpp-client.theme";
const PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

type Listener = () => void;
const listeners = new Set<Listener>();
let preference: ThemePreference | undefined;

const darkQuery = () => (typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined);

function readStored(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return PREFERENCES.find((value) => value === stored) ?? "system";
  } catch {
    return "system";
  }
}

export const isDark = (value: ThemePreference, systemPrefersDark: boolean): boolean =>
  value === "dark" || (value === "system" && systemPrefersDark);

const PALETTE_KEY = "rpp-client.palette";
let palette: string | undefined;

function readStoredPalette(): string {
  try {
    const stored = localStorage.getItem(PALETTE_KEY);
    return isPaletteId(stored) ? stored : DEFAULT_PALETTE_ID;
  } catch {
    return DEFAULT_PALETTE_ID;
  }
}

function apply(): void {
  const dark = isDark(getThemePreference(), darkQuery()?.matches ?? false);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.palette = getPalette();
}

export function getPalette(): string {
  palette ??= readStoredPalette();
  return palette;
}

export function setPalette(id: string): void {
  if (!isPaletteId(id)) return;
  palette = id;
  try {
    localStorage.setItem(PALETTE_KEY, id);
  } catch {
    // The choice still holds for this page view.
  }
  apply();
  listeners.forEach((listener) => listener());
}

export function getThemePreference(): ThemePreference {
  preference ??= readStored();
  return preference;
}

export function setThemePreference(value: ThemePreference): void {
  preference = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // The choice still holds for this page view.
  }
  apply();
  listeners.forEach((listener) => listener());
}

export function subscribeToTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Applies the stored preference and follows the system setting while the preference is `system`. */
export function initTheme(): void {
  apply();
  darkQuery()?.addEventListener("change", apply);
}
