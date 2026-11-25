import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button-variants";
import { EmptyState } from "./layout";

/** What every screen that needs a server shows before there is a connection, so the wording is the same everywhere. */
export function NotConnected() {
  return (
    <EmptyState
      title="Connect to a server first"
      action={
        <Link to="/connection" className={buttonVariants({ variant: "secondary" })}>
          Set up a connection
        </Link>
      }
    >
      This screen needs a connection. It stays empty until you are connected and the capabilities of the server have been read.
    </EmptyState>
  );
}
