import type { ReactNode } from "react";

/** Terms and their values, divided by rules; the term column collapses above the value on a narrow screen. */
export function DefinitionList({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-border border-y border-border">{children}</dl>;
}

export function DefinitionRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
      <dt className="font-medium">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export const Nothing = ({ children = "None" }: { children?: ReactNode }) => <span className="text-muted-foreground">{children}</span>;
