import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Tabs that each hold a workflow. Every panel stays mounted, so a form and its result survive a visit to another tab. */
export function WorkflowTabs<Id extends string>({
  label,
  workflows,
  descriptions,
  panels,
  selected,
  onSelect,
}: {
  label: string;
  workflows: readonly { id: Id; label: string }[];
  descriptions: Record<Id, string>;
  panels: Record<Id, ReactNode>;
  selected: Id;
  onSelect(id: Id): void;
}) {
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: KeyboardEvent) => {
    const index = workflows.findIndex((item) => item.id === selected);
    const last = workflows.length - 1;
    const next =
      event.key === "ArrowRight" ? (index + 1) % workflows.length : event.key === "ArrowLeft" ? (index - 1 + workflows.length) % workflows.length : event.key === "Home" ? 0 : event.key === "End" ? last : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const target = workflows[next];
    if (!target) return;
    onSelect(target.id);
    tabs.current[target.id]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
        {workflows.map((item) => {
          const active = item.id === selected;
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabs.current[item.id] = element;
              }}
              role="tab"
              type="button"
              id={`tab-${item.id}`}
              aria-selected={active}
              aria-controls={`panel-${item.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(item.id)}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-4 py-2.5 font-medium transition-colors",
                active ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {workflows.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`panel-${item.id}`}
          aria-labelledby={`tab-${item.id}`}
          hidden={item.id !== selected}
          className="flex flex-col gap-6 pt-6"
        >
          <p className="max-w-[62ch] text-muted-foreground">{descriptions[item.id]}</p>
          {panels[item.id]}
        </div>
      ))}
    </div>
  );
}
