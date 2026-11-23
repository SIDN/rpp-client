import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-border pb-5">
      <div className="min-w-0 max-w-[62ch]">
        <h1>{title}</h1>
        {description && <p className="mt-1.5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A titled part of a page, separated by a rule rather than boxed. */
export function Section({
  title,
  description,
  children,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  id: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={cn("flex flex-col gap-4", className)}>
      <div className="max-w-[62ch]">
        <h2 id={`${id}-title`}>{title}</h2>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** An empty screen says why it is empty and what to do about it. */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-md border border-dashed border-input px-6 py-8", className)}>
      <h2 className="text-lg">{title}</h2>
      {children && <div className="max-w-[62ch] text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}
