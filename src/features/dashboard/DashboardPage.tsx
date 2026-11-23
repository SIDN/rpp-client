import { Link } from "react-router-dom";
import { PageHeader, Section } from "@/components/common/layout";

const START_POINTS = [
  { to: "/domains", name: "Registry", text: "Register and maintain domain names, contacts, hosts and organisations, and read your messages." },
  { to: "/extensions", name: "Extensions", text: "See which extensions the server offers and use the ones this client supports." },
  { to: "/developer/capabilities", name: "Developer", text: "Inspect capabilities, schemas and every request and response, with secrets removed." },
] as const;

export function DashboardPage() {
  return (
    <>
      <PageHeader title="Overview" description="Manage shared objects in a RPP backend." />

      <Section id="start" title="Where to start">
        <ul className="divide-y divide-border border-y border-border">
          {START_POINTS.map((point) => (
            <li key={point.to}>
              <Link to={point.to} className="flex flex-col gap-0.5 py-4 hover:bg-muted/60 sm:flex-row sm:items-baseline sm:gap-8">
                <span className="w-32 shrink-0 font-semibold">{point.name}</span>
                <span className="max-w-[62ch] text-muted-foreground">{point.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
