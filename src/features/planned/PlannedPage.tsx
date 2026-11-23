import { Link } from "react-router-dom";
import { objectSupport } from "@/application/capability";
import { useDiscoveryState } from "@/app/discovery-context";
import type { NavItem } from "@/app/navigation";
import { EmptyState, PageHeader } from "@/components/common/layout";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { buttonVariants } from "@/components/ui/button-variants";

/** A screen whose workflow is not built yet. It still tells the truth about the server. */
export function PlannedPage({ item }: { item: NavItem }) {
  const discovery = useDiscoveryState();
  const support = item.requires ? objectSupport(discovery, item.requires) : undefined;

  return (
    <>
      <PageHeader title={item.label} description={item.purpose} actions={<Badge tone="info">Not built yet</Badge>} />

      {support === "not-offered" && (
        <Callout tone="warning" title="This server does not offer this">
          Its discovery document does not list {item.label.toLowerCase()}. Nothing on this screen can work against it.
        </Callout>
      )}

      {support === "unknown" && (
        <EmptyState
          title="Connect to a server first"
          action={
            <Link to="/connection" className={buttonVariants({ variant: "secondary" })}>
              Set up a connection
            </Link>
          }
        >
          What a server offers is only known after its capabilities have been read. This screen stays empty until then.
        </EmptyState>
      )}

      {support !== "unknown" && support !== "not-offered" && (
        <EmptyState title="This screen is not built yet">
          Until it is, the same work is not available in this app.
        </EmptyState>
      )}
    </>
  );
}
