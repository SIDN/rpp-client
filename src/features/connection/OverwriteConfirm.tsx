import { useId } from "react";
import { Button } from "@/components/ui/button";

/** Asks before a bookmark is replaced by what is in the form. */
export function OverwriteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm(): void; onCancel(): void }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-md border-2 border-danger p-4">
      <h4 id={`${id}-title`} className="font-semibold">
        A bookmark named {name} already exists
      </h4>
      <p className="text-sm">Overwriting replaces its address, authentication and preset settings with what is in the form.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" onClick={onConfirm}>
          Overwrite {name}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Do not overwrite
        </Button>
      </div>
    </div>
  );
}
