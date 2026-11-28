import { t } from "@/i18n";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Shuffle } from "lucide-react";
import { applyPatch } from "@/application/organisations/applyPatch";
import { createSyntheticOrganisation, synthesizeChildren } from "@/application/organisations/syntheticOrganisations";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { Organisation } from "@/rpp/core/types/objects";
import { OrganisationDetails } from "./OrganisationDetails";
import {
  OrganisationCreateForm,
  OrganisationDeleteConfirm,
  OrganisationEditForm,
  OrganisationPanel,
  OrganisationsTable,
  OrganisationsToolbar,
  type Selection,
} from "./OrganisationDirectory";

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/** What was last done to the made-up list, said once: nothing of it reached a server. */
type Notice = { kind: "changed" | "created" | "deleted"; id: string } | undefined;

function noticeTitle(notice: Exclude<Notice, undefined>): string {
  switch (notice.kind) {
    case "changed":
      return t("organisations.synthetic.changed", { id: notice.id });
    case "created":
      return t("organisations.synthetic.created", { id: notice.id });
    case "deleted":
      return t("organisations.synthetic.deleted", { id: notice.id });
  }
}

/**
 * Made-up child organisations of `parentId`. They live in this screen only: edits, additions and deletions change the
 * list here, and nothing is sent.
 */
export function SyntheticOrganisations({ parentId }: { parentId: string }) {
  const [organisations, setOrganisations] = useState<Organisation[]>(() => synthesizeChildren(parentId, { seed: randomSeed() }));
  const [selection, setSelection] = useState<Selection>();
  const [notice, setNotice] = useState<Notice>();
  const [problem, setProblem] = useState<string>();

  const choose = (next: Selection) => {
    setNotice(undefined);
    setProblem(undefined);
    setSelection(next);
  };
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };
  const chosen = selection && selection.mode !== "create" ? organisations.find((organisation) => organisation.id === selection.id) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Callout tone="warning" title={t("messages.synthetic.title")}>
        {t("organisations.synthetic.descriptionBeforeSettings")}{" "}
        <Link to="/developer/settings" className="underline">
          {t("messages.synthetic.settings")}
        </Link>
        {t("messages.synthetic.descriptionAfterSettings")}
      </Callout>

      <OrganisationsToolbar onAdd={() => choose({ mode: "create" })}>
        <Button
          variant="secondary"
          onClick={() => {
            choose(undefined);
            setOrganisations(synthesizeChildren(parentId, { seed: randomSeed() }));
          }}
        >
          <Shuffle aria-hidden />
          {t("organisations.action.newExamples")}
        </Button>
      </OrganisationsToolbar>

      {notice && (
        <Callout tone="success" title={noticeTitle(notice)}>
          {t("organisations.synthetic.nothingSent")}
        </Callout>
      )}

      <OrganisationsTable parentId={parentId} organisations={organisations} selection={selection} busy={false} onSelect={choose} />

      {selection && (
        <OrganisationPanel selection={selection} parentId={parentId} onClose={() => choose(undefined)}>
          {problem && <Callout tone="danger" title={problem} />}
          {selection.mode === "create" && (
            <OrganisationCreateForm
              parentId={parentId}
              existing={organisations.map((organisation) => organisation.id)}
              pending={false}
              onCancel={() => choose(undefined)}
              onCreate={(input) =>
                attempt(() => {
                  const created = createSyntheticOrganisation(input, organisations);
                  setOrganisations([...organisations, created]);
                  choose({ mode: "view", id: created.id });
                  setNotice({ kind: "created", id: created.id });
                })
              }
            />
          )}
          {selection.mode === "view" && chosen && <OrganisationDetails organisation={chosen} />}
          {selection.mode === "edit" && chosen && (
            <OrganisationEditForm
              key={selection.id}
              organisation={chosen}
              pending={false}
              onCancel={() => choose(undefined)}
              onSave={(operations) =>
                attempt(() => {
                  const changed = applyPatch(chosen, operations);
                  setOrganisations(organisations.map((organisation) => (organisation.id === selection.id ? changed : organisation)));
                  choose({ mode: "view", id: selection.id });
                  setNotice({ kind: "changed", id: selection.id });
                })
              }
            />
          )}
          {selection.mode === "delete" && chosen && (
            <OrganisationDeleteConfirm
              key={selection.id}
              organisation={chosen}
              pending={false}
              description={(withUsers, noun) =>
                withUsers ? t("organisations.synthetic.deleteDescriptionWithUsers", { id: selection.id, noun }) : t("organisations.synthetic.deleteDescription", { id: selection.id })
              }
              onCancel={() => choose(undefined)}
              onConfirm={() => {
                setOrganisations(organisations.filter((organisation) => organisation.id !== selection.id));
                choose(undefined);
                setNotice({ kind: "deleted", id: selection.id });
              }}
            />
          )}
        </OrganisationPanel>
      )}
    </div>
  );
}
