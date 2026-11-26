import { objectSupport } from "@/application/capability";
import { useDiscoveryState } from "@/app/discovery-context";
import type { NavItem } from "@/app/navigation";
import { EmptyState, PageHeader } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { t } from "@/i18n";

/** A screen whose workflow is not built yet. It still tells the truth about the server. */
export function PlannedPage({ item }: { item: NavItem }) {
  const discovery = useDiscoveryState();
  const support = item.requires ? objectSupport(discovery, item.requires) : undefined;

  return (
    <>
      <PageHeader title={t(item.labelKey)} description={t(item.purposeKey)} actions={<Badge tone="info">{t("planned.notBuiltYet")}</Badge>} />

      {support === "not-offered" && (
        <Callout tone="warning" title={t("planned.notOffered.title")}>
          {t("planned.notOffered.description", { feature: t(item.labelKey).toLowerCase() })}
        </Callout>
      )}

      {support === "unknown" && (
        <NotConnected />
      )}

      {support !== "unknown" && support !== "not-offered" && (
        <EmptyState title={t("planned.notBuilt.title")}>
          {t("planned.notBuilt.description")}
        </EmptyState>
      )}
    </>
  );
}
