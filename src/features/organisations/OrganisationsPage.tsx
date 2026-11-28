import { Link, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { t } from "@/i18n";
import { useConnection } from "@/app/connection-context";
import { useSettings } from "@/app/settings-context";
import { PageHeader } from "@/components/common/layout";
import { buttonVariants } from "@/components/ui/button-variants";
import { Callout } from "@/components/ui/callout";
import { accountOf, EXAMPLE_ORGANISATION } from "./account";
import { LiveOrganisations } from "./LiveOrganisations";
import { ScreenGate } from "./ScreenGate";
import { SyntheticOrganisations } from "./SyntheticOrganisations";

const header = () => <PageHeader title={t("organisations.page.title")} description={t("organisations.page.description")} />;

function ParentLine({ parent, username }: { parent: string; username: string | undefined }) {
  return (
    <p className="-mt-2 text-sm text-muted-foreground" data-testid="organisations-parent">
      {username ? t("organisations.parent.context", { parent, user: username }) : t("organisations.parent.contextWithoutUser", { parent })}
    </p>
  );
}

/**
 * The child organisations of the organisation of the logged-in user, in one table: an organisation is shown by choosing
 * its identifier, and each row can be edited or deleted. The parent comes from the connection profile. A server has no
 * list of children, so they are found with a QUERY on `parent.id`. With synthesized data on, they are made up and
 * nothing is sent. A link with `?name=` (from Search) shows that organisation at once.
 */
export function OrganisationsPage() {
  const { session, lastProfile } = useConnection();
  const { settings } = useSettings();
  const [params] = useSearchParams();
  const [initial] = useState(() => params.get("name")?.trim() || undefined);

  // Made-up organisations need no server, so they need no connection either.
  if (settings.synthesizeData) {
    const account = accountOf(session?.profile ?? lastProfile);
    const parent = account?.organisation ?? EXAMPLE_ORGANISATION;
    return (
      <>
        {header()}
        <div className="flex flex-col gap-6">
          <ParentLine parent={parent} username={account?.username} />
          <SyntheticOrganisations key={parent} parentId={parent} />
        </div>
      </>
    );
  }

  return (
    <ScreenGate header={header()} type="organisation" notOffered={t("organisations.connection.notOffered")} notListed={t("organisations.connection.discoveryNotListed")}>
      {() => {
        const account = accountOf(session?.profile);
        if (!account) {
          return (
            <Callout tone="warning" title={t("organisations.parent.missingTitle")}>
              <p>{t("organisations.parent.missingDescription")}</p>
              <Link to="/connection" className={`${buttonVariants({ variant: "secondary" })} mt-3`}>
                {t("organisations.parent.missingAction")}
              </Link>
            </Callout>
          );
        }
        return (
          <>
            <ParentLine parent={account.organisation} username={account.username} />
            <LiveOrganisations key={account.organisation} parentId={account.organisation} initial={initial} />
          </>
        );
      }}
    </ScreenGate>
  );
}
