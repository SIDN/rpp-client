import type { ServerSupport } from "@/application/capability";
import { cn } from "@/lib/utils";

const text: Record<ServerSupport, string> = {
  offered: "Offered by the server",
  "not-offered": "Not offered by the server",
  unknown: "Not confirmed: no server capabilities read yet",
};

/**
 * Whether the server confirms a feature, as a mark that survives without colour: filled is confirmed, a ring is not
 * yet known, a bar is not offered. It says nothing about whether this client implements the feature.
 */
export function CapabilityMark({ support, className }: { support: ServerSupport; className?: string }) {
  return (
    <span role="img" aria-label={text[support]} title={text[support]} className={cn("inline-flex size-2.5 items-center justify-center", className)}>
      {support === "offered" && <span className="size-2 rounded-full bg-accent" />}
      {support === "unknown" && <span className="size-2 rounded-full border border-current opacity-70" />}
      {support === "not-offered" && <span className="h-0.5 w-2 rounded-full bg-current opacity-70" />}
    </span>
  );
}
