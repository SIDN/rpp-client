import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * The panel under a directory table that shows what was chosen in it. Its heading takes the focus whenever `focusKey`
 * changes, so that the change is announced and the keyboard continues from there.
 */
export function DirectoryPanel({ title, focusKey, closeLabel, onClose, children }: { title: string; focusKey: string; closeLabel: string; onClose(): void; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => {
    heading.current?.focus();
  }, [focusKey]);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5 rounded-md border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={id} ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
          {title}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
      {children}
    </section>
  );
}
