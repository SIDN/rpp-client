import type { ReactNode } from "react";
import { t } from "@/i18n";
import { objectSupport } from "@/application/capability";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { NotConnected } from "@/components/common/NotConnected";
import { Callout } from "@/components/ui/callout";
import type { ResourceType } from "@/rpp/core/types/resources";

/**
 * The header, then the screen only once there is a connection to a server that lists `type`; otherwise why not.
 */
export function ScreenGate({ header, type, notOffered, notListed, children }: { header: ReactNode; type: ResourceType; notOffered: string; notListed: string; children: () => ReactNode }) {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const support = objectSupport(discovery, type);

  let body: ReactNode;
  if (discovery.status === "not-started") {
    body = <NotConnected />;
  } else if (discovery.status === "loading") {
    body = <Callout tone="info" title={t("organisations.connection.readingCapabilities")} />;
  } else if (support !== "offered" || !session) {
    body = (
      <Callout tone="warning" title={discovery.status === "failed" ? t("organisations.connection.capabilitiesFailed") : support !== "offered" ? notOffered : t("organisations.connection.noConnection")}>
        {discovery.status === "failed" ? discovery.error.message : support !== "offered" ? notListed : t("organisations.connection.setUpFirst")}
      </Callout>
    );
  } else {
    body = children();
  }
  return (
    <>
      {header}
      {body}
    </>
  );
}
