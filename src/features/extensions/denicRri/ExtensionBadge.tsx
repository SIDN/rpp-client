import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n";
import type { RppExtensionModule } from "@/rpp/extensions/ExtensionModule";

/** Marks what an extension adds, so that it is not taken for part of the core protocol. */
export function ExtensionBadge({ module }: { module: RppExtensionModule }) {
  return (
    <Badge tone="info" title={module.id}>
      {t("extensions.badge", { name: module.displayName })}
    </Badge>
  );
}
