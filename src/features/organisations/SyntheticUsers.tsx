import { t } from "@/i18n";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Shuffle } from "lucide-react";
import { applyPatch } from "@/application/organisations/applyPatch";
import { createSyntheticUser, synthesizeUsers, type SyntheticUser } from "@/application/organisations/syntheticUsers";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { UserDetails } from "./UserDetails";
import { UserCreateForm, UserDeleteConfirm, UserEditForm, UserPanel, UsersTable, UsersToolbar, type Selection } from "./UserDirectory";

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/** What was last done to the made-up list, said once: nothing of it reached a server. */
type Notice = { kind: "changed" | "created" | "deleted"; id: string } | undefined;

function noticeTitle(notice: Exclude<Notice, undefined>): string {
  switch (notice.kind) {
    case "changed":
      return t("users.synthetic.changed", { user: notice.id });
    case "created":
      return t("users.synthetic.created", { user: notice.id });
    case "deleted":
      return t("users.synthetic.deleted", { user: notice.id });
  }
}

/**
 * Made-up users of the organisation, for when the server cannot list them yet. They live in this screen only: edits,
 * additions and deletions change the list here, and nothing is sent.
 */
export function SyntheticUsers({ organisationId }: { organisationId: string }) {
  const [users, setUsers] = useState<SyntheticUser[]>(() => synthesizeUsers(organisationId, { seed: randomSeed() }));
  const [selection, setSelection] = useState<Selection>();
  const [notice, setNotice] = useState<Notice>();
  const [problem, setProblem] = useState<string>();

  const choose = (next: Selection) => {
    setNotice(undefined);
    setProblem(undefined);
    setSelection(next);
  };
  const chosen = selection && selection.mode !== "create" ? users.find(({ user }) => user.id === selection.id)?.user : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Callout tone="warning" title={t("messages.synthetic.title")}>
        {t("users.synthetic.descriptionBeforeSettings")}{" "}
        <Link to="/developer/settings" className="underline">
          {t("messages.synthetic.settings")}
        </Link>
        {t("messages.synthetic.descriptionAfterSettings")}
      </Callout>

      <UsersToolbar onAdd={() => choose({ mode: "create" })}>
        <Button
          variant="secondary"
          onClick={() => {
            choose(undefined);
            setUsers(synthesizeUsers(organisationId, { seed: randomSeed() }));
          }}
        >
          <Shuffle aria-hidden />
          {t("users.action.newExamples")}
        </Button>
      </UsersToolbar>

      {notice && (
        <Callout tone="success" title={noticeTitle(notice)}>
          {t("users.synthetic.nothingSent")}
        </Callout>
      )}

      <UsersTable organisationId={organisationId} rows={users.map(({ user, label }) => ({ id: user.id, label, user }))} selection={selection} busy={false} onSelect={choose} />

      {selection && (
        <UserPanel selection={selection} organisationId={organisationId} onClose={() => choose(undefined)}>
          {problem && <Callout tone="danger" title={problem} />}
          {selection.mode === "create" && (
            <UserCreateForm
              pending={false}
              existing={users.map(({ user }) => user.id)}
              onCancel={() => choose(undefined)}
              onCreate={(input) => {
                try {
                  const created = createSyntheticUser(organisationId, input, users);
                  setUsers([...users, created]);
                  choose({ mode: "view", id: created.user.id });
                  setNotice({ kind: "created", id: created.user.id });
                } catch (error) {
                  setProblem(error instanceof Error ? error.message : String(error));
                }
              }}
            />
          )}
          {selection.mode === "view" && chosen && <UserDetails user={chosen} />}
          {selection.mode === "edit" && chosen && (
            <UserEditForm
              key={selection.id}
              user={chosen}
              pending={false}
              onCancel={() => choose(undefined)}
              onSave={(operations) => {
                try {
                  const changed = applyPatch(chosen, operations);
                  setUsers(users.map((entry) => (entry.user.id === selection.id ? { ...entry, user: changed } : entry)));
                  choose({ mode: "view", id: selection.id });
                  setNotice({ kind: "changed", id: selection.id });
                } catch (error) {
                  setProblem(error instanceof Error ? error.message : String(error));
                }
              }}
            />
          )}
          {selection.mode === "delete" && (
            <UserDeleteConfirm
              organisationId={organisationId}
              userId={selection.id}
              pending={false}
              description={t("users.synthetic.deleteDescription", { user: selection.id })}
              onCancel={() => choose(undefined)}
              onConfirm={() => {
                setUsers(users.filter(({ user }) => user.id !== selection.id));
                choose(undefined);
                setNotice({ kind: "deleted", id: selection.id });
              }}
            />
          )}
        </UserPanel>
      )}
    </div>
  );
}
