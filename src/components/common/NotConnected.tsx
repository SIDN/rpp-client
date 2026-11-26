import { Link } from "react-router-dom";
import { t } from "@/i18n";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "./layout";

/** What every screen that needs a server shows before there is a connection, so the wording is the same everywhere. */
export function NotConnected() {
  return (
    <EmptyState
      title={t("common.notConnected.title")}
      action={
        <Link to="/connection" className={buttonVariants({ variant: "secondary" })}>
          {t("ui.connection.setUp")}
        </Link>
      }
    >
      {t("common.notConnected.description")}
    </EmptyState>
  );
}
