import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { EmptyState } from "@/components/common/layout";
import { buttonVariants } from "@/components/ui/button-variants";

export function NotFoundPage() {
  return (
    <EmptyState
      title="There is no screen at this address"
      action={
        <Link to="/" className={buttonVariants({ variant: "secondary" })}>
          Go to the overview
        </Link>
      }
    >
      Check the address, or pick a screen from the menu.
    </EmptyState>
  );
}

/** What the router shows when a screen throws while rendering. */
export function RouteError() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : "Unknown error";
  return (
    <div role="alert" className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 p-8">
      <h1>This screen failed to load</h1>
      <p className="text-muted-foreground">Reload the page. If it happens again, report the message below.</p>
      <pre className="w-full overflow-x-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{detail}</pre>
    </div>
  );
}
