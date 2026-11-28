import { t } from "@/i18n";
import { useEffect, useEffectEvent, useState } from "react";
import { RefreshCw } from "lucide-react";
import { childrenOf } from "@/application/organisations/childOrganisations";
import type { CreateOrganisationInput } from "@/application/organisations/organisationData";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { Organisation } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { OperationOutcome } from "../shared/OperationOutcome";
import { useOperation } from "../shared/useOperation";
import { useCachedOrganisations, useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
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

interface Removal {
  id: string;
  deleteUsers: boolean;
}

/**
 * The child organisations of `parentId` on the server, found with a QUERY on arrival. An organisation is read again
 * when it is shown, edited or deleted, so that what is changed starts from what the registry holds now. `initial` is an
 * organisation to show at once, as when a link from Search leads here; it need not be a child.
 */
export function LiveOrganisations({ parentId, initial }: { parentId: string; initial?: string }) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const cached = useCachedOrganisations();
  const [ids, setIds] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [selection, setSelection] = useState<Selection>(initial ? { mode: "view", id: initial } : undefined);
  const [deletedUsers, setDeletedUsers] = useState<string[]>([]);

  const list = useOperation(
    (variables: string, signal) => workflows.children(variables, { signal }),
    (result) => {
      const page = childrenOf(result.data ?? { results: [] });
      for (const organisation of page.organisations) store.remember(organisation.id, organisation);
      setIds(page.organisations.map((organisation) => organisation.id));
      setMore(page.more);
    },
  );
  const read = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );
  const change = useOperation(
    (variables: { id: string; operations: readonly PatchOperation[] }, signal) => workflows.change(variables.id, variables.operations, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.id, result.data);
      read.reset();
      setSelection({ mode: "view", id: variables.id });
    },
  );
  const create = useOperation(
    (input: CreateOrganisationInput, signal) => workflows.create(input, { signal }),
    (result, input) => {
      if (result.data) store.remember(input.id, result.data);
      setIds((current) => (current.includes(input.id) ? current : [...current, input.id]));
      setSelection({ mode: "view", id: input.id });
    },
  );
  const remove = useOperation(
    (variables: Removal, signal) =>
      workflows.remove(variables.id, {
        signal,
        deleteUsers: variables.deleteUsers,
        onUserDeleted: (userId) => {
          setDeletedUsers((done) => [...done, userId]);
          store.unlinkUser(variables.id, userId);
          store.forgetUser(variables.id, userId);
        },
      }),
    (_result, variables) => {
      store.forgetUsersOf(variables.id);
      store.forgetOrganisation(variables.id);
      setIds((current) => current.filter((id) => id !== variables.id));
      setSelection(undefined);
    },
  );

  const choose = (next: Selection) => {
    for (const operation of [read, change, create, remove]) operation.reset();
    setDeletedUsers([]);
    setSelection(next);
    if (next && next.mode !== "create") read.start(next.id);
  };

  const arrive = useEffectEvent((id: string) => {
    list.start(id);
    if (initial) read.start(initial);
  });
  useEffect(() => {
    arrive(parentId);
  }, [parentId]);

  const organisations = ids.flatMap((id) => cached.get(id) ?? []);
  const chosen: Organisation | undefined = selection && selection.mode !== "create" ? cached.get(selection.id) : undefined;
  const busy = change.pending || create.pending || remove.pending;
  const loaded = chosen && !read.pending;

  return (
    <div className="flex flex-col gap-6">
      <OrganisationsToolbar onAdd={() => choose({ mode: "create" })}>
        <Button variant="secondary" disabled={list.pending} onClick={() => list.start(parentId)}>
          <RefreshCw aria-hidden />
          {t("organisations.action.reload")}
        </Button>
      </OrganisationsToolbar>

      {/* The list itself is the success; only its progress and a failure are told. */}
      {!list.result && <OperationOutcome operation={list} success="" />}
      {/* Its progress and a failure are told in the panel; the panel closes once the organisation is gone. */}
      {remove.result && (
        <OperationOutcome operation={remove} success={t("organisations.outcome.deleted", { name: remove.variables?.id ?? "" })}>
          {(removed) =>
          removed.deletedUsers.length > 0 ? (
            <p className="text-sm">
              {t("organisations.delete.usersDeletedToo")}{" "}
              {removed.deletedUsers.map((user) => (
                <code key={user} className="mr-2">
                  {user}
                </code>
              ))}
            </p>
          ) : null
          }
        </OperationOutcome>
      )}

      {list.result && <OrganisationsTable parentId={parentId} organisations={organisations} selection={selection} busy={busy} onSelect={choose} />}
      {list.result && more && (
        <Callout tone="info" title={t("organisations.list.moreTitle")}>
          {t("organisations.list.moreDescription", { count: organisations.length })}
        </Callout>
      )}

      {selection && (
        <OrganisationPanel selection={selection} parentId={parentId} onClose={() => choose(undefined)}>
          {selection.mode === "create" && (
            <>
              <OrganisationCreateForm parentId={parentId} existing={ids} pending={create.pending} onCreate={(input) => create.start(input)} onCancel={() => choose(undefined)} />
              <OperationOutcome operation={create} success={t("organisations.outcome.created", { name: create.variables?.id ?? "" })} />
            </>
          )}
          {selection.mode === "view" && (
            <>
              <OperationOutcome operation={change} success={t("organisations.outcome.changed", { name: selection.id })} />
              <OperationOutcome operation={create} success={t("organisations.outcome.created", { name: selection.id })} />
              <OperationOutcome operation={read} success={t("organisations.outcome.found", { name: selection.id })} />
              {loaded && <OrganisationDetails organisation={chosen} />}
            </>
          )}
          {selection.mode === "edit" && (
            <>
              <OperationOutcome operation={read} success={t("organisations.change.loaded")} />
              {loaded && (
                <OrganisationEditForm
                  key={selection.id}
                  organisation={chosen}
                  pending={change.pending}
                  onSave={(operations) => change.start({ id: selection.id, operations })}
                  onCancel={() => choose(undefined)}
                />
              )}
              <OperationOutcome operation={change} success={t("organisations.outcome.changed", { name: selection.id })} />
            </>
          )}
          {selection.mode === "delete" && (
            <>
              <OperationOutcome operation={read} success={t("organisations.outcome.checked", { name: selection.id })} />
              {loaded && (
                <OrganisationDeleteConfirm
                  key={selection.id}
                  organisation={chosen}
                  pending={remove.pending}
                  description={(withUsers, noun) =>
                    withUsers ? t("organisations.delete.confirmDescriptionWithUsers", { id: selection.id, noun }) : t("organisations.delete.confirmDescription", { id: selection.id })
                  }
                  onConfirm={(deleteUsers) => {
                    setDeletedUsers([]);
                    remove.start({ id: selection.id, deleteUsers });
                  }}
                  onCancel={() => choose(undefined)}
                />
              )}
              {deletedUsers.length > 0 && !remove.result && (
                <p role="status" className="text-sm">
                  {t("organisations.delete.usersDeletedSoFar")}{" "}
                  {deletedUsers.map((user) => (
                    <code key={user} className="mr-2">
                      {user}
                    </code>
                  ))}
                </p>
              )}
              <OperationOutcome operation={remove} success={t("organisations.outcome.deleted", { name: selection.id })} />
            </>
          )}
        </OrganisationPanel>
      )}
    </div>
  );
}
