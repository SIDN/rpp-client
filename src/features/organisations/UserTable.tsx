import { t } from "@/i18n";
import type { ReactNode } from "react";
import type { UserLink } from "@/application/organisations/organisationData";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

/** The users known of an organisation, one to a row, each with the button that takes it on. */
function actionLabel(action: string): string {
  return action === "edit" ? t("organisations.userTable.edit") : t("organisations.userTable.choose");
}

export function UserTable({
  organisationId,
  users,
  selected,
  busy,
  action,
  onSelect,
  empty,
}: {
  organisationId: string;
  users: readonly UserLink[];
  selected: string | undefined;
  busy: boolean;
  /** The button action shown for each row. */
  action: "edit" | "choose";
  onSelect(id: string): void;
  empty?: ReactNode;
}) {
  if (users.length === 0) {
    return (
      <Callout tone="info" title={t("organisations.userTable.noneKnown")}>
        {empty ?? t("organisations.userTable.noneKnownDescription")}
      </Callout>
    );
  }
  return (
    <div className="max-w-xl overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("organisations.userTable.caption", { id: organisationId })}</caption>
        <thead className="bg-muted/50 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">{t("organisations.userTable.user")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("organisations.userTable.role")}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              <span className="sr-only">{t("organisations.userTable.action")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((user) => (
            <tr key={user.id} aria-selected={user.id === selected} className={user.id === selected ? "bg-muted/60" : undefined}>
              <td className="px-3 py-2">
                <code>{user.id}</code>
              </td>
              <td className="px-3 py-2">{user.label || <span className="text-muted-foreground">{t("organisations.userTable.notListed")}</span>}</td>
              <td className="px-3 py-2 text-right">
                <Button variant="secondary" size="sm" disabled={busy} aria-label={t("organisations.userTable.actionFor", { action: actionLabel(action), id: user.id })} onClick={() => onSelect(user.id)}>
                  {action}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
