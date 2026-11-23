import { useState } from "react";
import { useSettings } from "@/app/settings-context";
import { formatDateTime } from "@/lib/dateTime";
import { Nothing } from "@/components/common/definition";
import { Button } from "@/components/ui/button";
import type { ProvMetadata } from "@/rpp/core/types/objects";

export function Timestamp({ value }: { value: string | undefined }) {
  const { settings } = useSettings();
  if (value === undefined) return <Nothing>Not given</Nothing>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <code>{value}</code>;
  return (
    <span>
      <time dateTime={value}>{formatDateTime(value, settings.timeDisplay)}</time> <code className="ml-1 text-xs text-muted-foreground">{value}</code>
    </span>
  );
}

/** Members of an object that this client does not model, as received. */
export function OtherMembers({ members }: { members: readonly (readonly [string, unknown])[] }) {
  return (
    <dl className="flex flex-col gap-2">
      {members.map(([key, member]) => (
        <div key={key}>
          <dt><code>{key}</code></dt>
          <dd><code className="break-all text-xs">{JSON.stringify(member)}</code></dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonView({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="rounded-md border border-border">
      <summary className="cursor-pointer px-3 py-2 font-medium">Show the JSON</summary>
      <pre tabIndex={0} aria-label={label} className="max-h-[28rem] overflow-auto border-t border-border p-3 font-mono text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/** A secret shown as dots until the person asks to see it. */
export function Secret({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="flex flex-wrap items-center gap-3">
      <code>{shown ? value : "•".repeat(Math.min(Math.max(value.length, 6), 16))}</code>
      <Button variant="ghost" size="sm" aria-pressed={shown} onClick={() => setShown((current) => !current)}>
        {shown ? "Hide" : "Show"}
      </Button>
    </span>
  );
}

export function Provisioning({ metadata }: { metadata: ProvMetadata }) {
  const rows: [string, string | undefined, boolean][] = [
    ["Sponsoring registrar", metadata.spClientId, false],
    ["Created by", metadata.crClientId, false],
    ["Created", metadata.crDate, true],
    ["Last updated by", metadata.upClientId, false],
    ["Last updated", metadata.upDate, true],
    ["Last transferred", metadata.trDate, true],
    ["Repository", metadata.repositoryId, false],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)]">
      {rows
        .filter(([, value]) => value !== undefined)
        .map(([label, value, isTime]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{isTime ? <Timestamp value={value} /> : <code>{value}</code>}</dd>
          </div>
        ))}
    </dl>
  );
}

