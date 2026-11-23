import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { getThemePreference, setThemePreference, subscribeToTheme, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "Match system", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const current = useSyncExternalStore(subscribeToTheme, getThemePreference, () => "system" as const);
  return (
    <div role="group" aria-label="Colour theme" className={cn("inline-flex rounded-md border border-input bg-surface p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={current === value}
          title={label}
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
