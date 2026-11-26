import { Link } from "react-router-dom";

export const REQUEST_CONTACTS_PATH = "/request-contacts";

/** The request contact, looked up on the Request contacts screen as soon as it opens. */
export function RequestContactLink({ id }: { id: string }) {
  const query = new URLSearchParams({ tab: "info", name: id, run: "1" });
  return (
    <Link to={`${REQUEST_CONTACTS_PATH}?${query}`} className="underline underline-offset-2">
      <code>{id}</code>
    </Link>
  );
}
