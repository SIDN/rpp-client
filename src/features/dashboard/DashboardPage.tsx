import { Link } from "react-router-dom";
import { PageHeader, Section } from "@/components/common/layout";
import { t } from "@/i18n";

const START_POINTS = [
  { to: "/domains", nameKey: "dashboard.registry.name", textKey: "dashboard.registry.description" },
  { to: "/developer/capabilities", nameKey: "dashboard.developer.name", textKey: "dashboard.developer.description" },
] as const;

export function DashboardPage() {
  return (
    <>
      <PageHeader title={t("nav.overview.label")} description={t("dashboard.description")} />

      <Section id="start" title={t("dashboard.start.title")}>
        <ul className="divide-y divide-border border-y border-border">
          {START_POINTS.map((point) => (
            <li key={point.to}>
              <Link to={point.to} className="flex flex-col gap-0.5 py-4 hover:bg-muted/60 sm:flex-row sm:items-baseline sm:gap-8">
                <span className="w-32 shrink-0 font-semibold">{t(point.nameKey)}</span>
                <span className="max-w-[62ch] text-muted-foreground">{t(point.textKey)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
