import { Inbox } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import type { QueueMonitor } from "@/rpp/client/queueMonitor";
import { cn } from "@/lib/utils";
import { useConnection } from "./connection-context";

function describe(size: number | undefined): string {
  if (size === undefined) return "Messages, the size of the queue is not known yet";
  if (size === 0) return "Messages, none waiting";
  return `Messages, ${size} waiting`;
}

function Counter({ queue }: { queue: QueueMonitor }) {
  const { size } = useSyncExternalStore(queue.subscribe, queue.get);
  const waiting = size !== undefined && size > 0;

  return (
    <Link
      to="/messages"
      aria-label={describe(size)}
      title={describe(size)}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm font-medium transition-colors focus-visible:outline-accent",
        waiting ? "border-transparent bg-accent text-accent-foreground hover:brightness-95" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Inbox aria-hidden className="size-4 shrink-0" />
      <span aria-hidden className="hidden sm:inline">
        Messages
      </span>
      <span aria-hidden className="min-w-4 text-center tabular-nums">
        {size ?? "–"}
      </span>
    </Link>
  );
}

/** The number of messages waiting in the queue, from `RPP-Queue-Size`; in colour when there are some, and a link to them. */
export function MessageCounter() {
  const { session } = useConnection();
  return session ? <Counter queue={session.queue} /> : null;
}
