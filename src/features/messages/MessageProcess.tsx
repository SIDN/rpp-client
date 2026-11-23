import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ProcessView } from "@/application/messages/process";
import { Nothing } from "@/components/common/definition";
import { buttonVariants } from "@/components/ui/button-variants";
import { OtherMembers, Timestamp } from "../shared/objectParts";
import { processLink } from "./processLink";

/** A process of a message as a table of its members, with a link to the screen of its object. */
export function MessageProcess({ process, objectType, objectId }: { process: ProcessView; objectType: string; objectId: string }) {
  const link = processLink(objectType, objectId, process.kind);
  const rows: { term: string; value: ReactNode }[] = [
    { term: "Process ID", value: process.id ? <code>{process.id}</code> : <Nothing>Not given</Nothing> },
    { term: "Type", value: process.type ? <code>{process.type}</code> : <Nothing>Not given</Nothing> },
    ...process.fields.map((entry) => ({
      term: entry.term,
      value: entry.kind === "time" ? <Timestamp value={entry.value} /> : <code>{entry.value}</code>,
    })),
  ];

  return (
    <section aria-label="Process" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="text-base font-medium">Process</h4>
        {link && (
          <Link to={link.to} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open in {link.label}
          </Link>
        )}
      </div>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Members of the process</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.term} className="border-t border-border">
              <th scope="row" className="w-48 py-1.5 pr-3 text-left font-normal text-muted-foreground">
                {row.term}
              </th>
              <td className="py-1.5 break-all">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {process.others.length > 0 && <OtherMembers members={process.others} />}
    </section>
  );
}
