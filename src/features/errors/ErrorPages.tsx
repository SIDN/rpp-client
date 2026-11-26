import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { EmptyState } from "@/components/common/layout";
import { buttonVariants } from "@/components/ui/button-variants";
import { t } from "@/i18n";

export function NotFoundPage() {
  return (
    <EmptyState
      title={t("errors.notFound.title")}
      action={
        <Link to="/" className={buttonVariants({ variant: "secondary" })}>
          {t("errors.notFound.action")}
        </Link>
      }
    >
      {t("errors.notFound.description")}
    </EmptyState>
  );
}

/** What the router shows when a screen throws while rendering. */
export function RouteError() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : t("errors.route.unknown");
  return (
    <div role="alert" className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 p-8">
      <h1>{t("errors.route.title")}</h1>
      <p className="text-muted-foreground">{t("errors.route.description")}</p>
      <pre className="w-full overflow-x-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{detail}</pre>
    </div>
  );
}
