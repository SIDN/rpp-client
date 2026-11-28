import { Link } from "react-router-dom";
import { t } from "@/i18n";
import { useConnection } from "@/app/connection-context";
import { useSettings } from "@/app/settings-context";
import { PageHeader } from "@/components/common/layout";
import { buttonVariants } from "@/components/ui/button-variants";
import { Callout } from "@/components/ui/callout";
import { accountOf, EXAMPLE_ORGANISATION } from "./account";
import { LiveUsers } from "./LiveUsers";
import { ScreenGate } from "./ScreenGate";
import { SyntheticUsers } from "./SyntheticUsers";

const header = () => <PageHeader title={t("users.page.title")} description={t("users.page.description")} />;

function OrganisationLine({ organisation, username }: { organisation: string; username: string | undefined }) {
  return (
    <p className="-mt-2 text-sm text-muted-foreground" data-testid="users-organisation">
      {username ? t("users.organisation.context", { organisation, user: username }) : t("users.organisation.contextWithoutUser", { organisation })}
    </p>
  );
}

/**
 * Every user of the organisation of the logged-in user, in one table: a user is shown by choosing its identifier, and
 * each row can be edited or deleted. A user is only known within its organisation (`/organisations/{id}/users/{id}`);
 * that organisation comes from the connection profile, not from the screen, because a client manages users only in its
 * own organisation (draft-ietf-rpp-data-objects 16). With synthesized data on, the users are made up and nothing is sent.
 */
export function UsersPage() {
  const { session, lastProfile } = useConnection();
  const { settings } = useSettings();

  // Made-up users need no server, so they need no connection either.
  if (settings.synthesizeData) {
    const account = accountOf(session?.profile ?? lastProfile);
    const organisation = account?.organisation ?? EXAMPLE_ORGANISATION;
    return (
      <>
        {header()}
        <div className="flex flex-col gap-6">
          <OrganisationLine organisation={organisation} username={account?.username} />
          <SyntheticUsers key={organisation} organisationId={organisation} />
        </div>
      </>
    );
  }

  return (
    <ScreenGate header={header()} type="user" notOffered={t("users.connection.notOffered")} notListed={t("users.connection.discoveryNotListed")}>
      {() => {
        const account = accountOf(session?.profile);
        if (!account) {
          return (
            <Callout tone="warning" title={t("users.organisation.missingTitle")}>
              <p>{t("users.organisation.missingDescription")}</p>
              <Link to="/connection" className={`${buttonVariants({ variant: "secondary" })} mt-3`}>
                {t("users.organisation.missingAction")}
              </Link>
            </Callout>
          );
        }
        return (
          <>
            <OrganisationLine organisation={account.organisation} username={account.username} />
            <LiveUsers key={account.organisation} organisationId={account.organisation} />
          </>
        );
      }}
    </ScreenGate>
  );
}
