export interface Palette {
  id: string;
  label: string;
  /** Background, primary and accent of the light appearance, then of the dark one; only for the preview chips. */
  swatches: readonly [string, string, string, string, string, string];
}

/** The colour schemes the person can choose from. The colours themselves are in src/palettes.css and index.css. */
export const PALETTES: readonly Palette[] = [
  { id: "default", label: "Teal and sodium", swatches: ["#f1f3f1", "#0d2f36", "#e8a317", "#0b1618", "#d9ebe7", "#e8a317"] },
  { id: "sidn", label: "SIDN", swatches: ["#f4f4f4", "#1961ac", "#e85422", "#002154", "#30a8cb", "#e85422"] },
  { id: "denic", label: "DENIC", swatches: ["#eeeeee", "#ff9a00", "#34789a", "#13303e", "#ff9a00", "#79b0cc"] },
  { id: "nord", label: "Nord", swatches: ["#eceff4", "#4c6a92", "#ebcb8b", "#2e3440", "#88c0d0", "#ebcb8b"] },
  { id: "solarized", label: "Solarized", swatches: ["#fdf6e3", "#2075b5", "#b58900", "#002b36", "#2aa198", "#b58900"] },
  { id: "catppuccin", label: "Catppuccin", swatches: ["#eff1f5", "#8839ef", "#df8e1d", "#1e1e2e", "#cba6f7", "#f9e2af"] },
  { id: "gruvbox", label: "Gruvbox", swatches: ["#fbf1c7", "#076678", "#d79921", "#282828", "#83a598", "#fabd2f"] },
  { id: "tokyo-night", label: "Tokyo Night", swatches: ["#e1e2e7", "#34548a", "#e0af68", "#1a1b26", "#7aa2f7", "#e0af68"] },
  { id: "rose-pine", label: "Rosé Pine", swatches: ["#faf4ed", "#7a6494", "#ea9d34", "#232136", "#c4a7e7", "#f6c177"] },
];

export const DEFAULT_PALETTE_ID = "default";

export const isPaletteId = (value: unknown): value is string => PALETTES.some((palette) => palette.id === value);
