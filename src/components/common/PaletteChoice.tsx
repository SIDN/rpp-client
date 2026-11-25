import { useSyncExternalStore } from "react";
import { PALETTES } from "@/lib/palettes";
import { getPalette, setPalette, subscribeToTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** The colour schemes as radio buttons, each with the colours it uses in the light and the dark appearance. */
export function PaletteChoice() {
  const current = useSyncExternalStore(subscribeToTheme, getPalette, () => "default");
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-medium">Colour scheme</legend>
      <p className="text-sm text-muted-foreground">
        Kept in this browser. Every scheme has a light and a dark appearance; the sun and moon switch in the header chooses between them.
      </p>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {PALETTES.map((palette) => (
          <label
            key={palette.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-md border bg-surface p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              current === palette.id ? "border-primary" : "border-border",
            )}
          >
            <input
              type="radio"
              name="colour-scheme"
              className="size-4 shrink-0 accent-primary"
              checked={current === palette.id}
              onChange={() => setPalette(palette.id)}
            />
            <span className="flex-1 font-medium">{palette.label}</span>
            <span aria-hidden className="flex">
              {palette.swatches.map((colour, index) => (
                <span
                  key={index}
                  className={cn("size-4 border border-border", index === 0 && "rounded-l-sm", index === 5 && "rounded-r-sm", index === 2 && "mr-1")}
                  style={{ backgroundColor: colour }}
                />
              ))}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
