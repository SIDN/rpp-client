import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { getThemePreference, setThemePreference, subscribeToTheme, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; labelKey: string; icon: LucideIcon }[] = [
  { value: "system", labelKey: "ui.theme.system", icon: Monitor },
  { value: "light", labelKey: "ui.theme.light", icon: Sun },
  { value: "dark", labelKey: "ui.theme.dark", icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const current = useSyncExternalStore(subscribeToTheme, getThemePreference, () => "system" as const);
  return (
    <div role="group" aria-label={t("ui.theme.groupLabel")} className={cn("inline-flex rounded-md border border-input bg-surface p-0.5", className)}>
      {OPTIONS.map(({ value, labelKey, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={t(labelKey)}
          aria-pressed={current === value}
          title={t(labelKey)}
          onClick={() => setThemePreference(value)}
          className={cn(
            "grid size-8 place-items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground",
            current === value && "bg-primary text-primary-foreground hover:text-primary-foreground",
          )}
        >
          <Icon aria-hidden className="size-4" />
        </button>
      ))}
    </div>
  );
}
