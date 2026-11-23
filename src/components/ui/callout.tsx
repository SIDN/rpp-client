import { AlertTriangle, CircleAlert, Info, CircleCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "./badge-variants";

const styles: Record<Exclude<Tone, "neutral">, { box: string; icon: LucideIcon }> = {
  info: { box: "border-info bg-info-soft text-info-ink", icon: Info },
  success: { box: "border-success bg-success-soft text-success-ink", icon: CircleCheck },
  warning: { box: "border-warning bg-warning-soft text-warning-ink", icon: AlertTriangle },
  danger: { box: "border-danger bg-danger-soft text-danger-ink", icon: CircleAlert },
};

/** A message about what happened and what to do next. Danger announces itself; the other tones wait to be read. */
export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Exclude<Tone, "neutral">;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = styles[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border-l-4 px-4 py-3", box, className)}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-sm">{children}</div>}
      </div>
    </div>
  );
}
