import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useDiscoveryState } from "@/app/discovery-context";
import { t } from "@/i18n";

/** One line that says which server the screens talk to and how much of it is confirmed. */
export function ConnectionStatus() {
  const discovery = useDiscoveryState();

  switch (discovery.status) {
    case "not-started":
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge dot>{t("ui.connection.notConnected")}</Badge>
          <span className="text-sm text-muted-foreground">
            {t("ui.connection.noServer")}{" "}
            <Link to="/connection" className="font-medium text-foreground underline underline-offset-2">
              {t("ui.connection.setUp")}
            </Link>
          </span>
        </div>
      );
    case "loading":
      return (
        <div className="flex items-center gap-3">
          <Badge tone="info" dot>
            {t("ui.connection.readingCapabilities")}
          </Badge>
        </div>
      );
    case "ready":
    case "partial": {
      const { environment, versions } = discovery.snapshot;
      const partial = discovery.status === "partial";
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/developer/capabilities" className="rounded-full underline-offset-2 hover:underline">
            <Badge tone={partial ? "warning" : "success"} dot>
              {t(partial ? "ui.connection.capabilitiesPartial" : "ui.connection.capabilitiesConfirmed")}
            </Badge>
          </Link>
          {environment && (
            <span className="text-sm">
              {environment.name}, {environment.status}
            </span>
          )}
          {versions[0] && <code className="truncate text-muted-foreground">{versions[0].baseUrl}</code>}
        </div>
      );
    }
    case "failed":
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge tone="danger" dot>
            {t("ui.connection.capabilitiesNotRead")}
          </Badge>
          <span className="text-sm">{discovery.error.message}</span>
        </div>
      );
  }
}
