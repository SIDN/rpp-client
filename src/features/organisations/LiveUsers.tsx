import { t } from "@/i18n";
import { useEffect, useEffectEvent, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { CreateUserInput } from "@/application/organisations/userData";
import type { PatchOperation } from "@/rpp/operations/patch";
import { Button } from "@/components/ui/button";
import { OperationOutcome } from "../shared/OperationOutcome";
import { useOperation } from "../shared/useOperation";
import { useCachedUsers, useKnownUsers, useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { UserDetails } from "./UserDetails";
import { UserCreateForm, UserDeleteConfirm, UserEditForm, UserPanel, UsersTable, UsersToolbar, type Selection, type UserRow } from "./UserDirectory";

interface Target {
  organisationId: string;
  userId: string;
}

/**
 * The users of the organisation on the server. The organisation is read on arrival, for the users it lists; a user's
 * own details are read when it is shown or edited, not all at once.
 */
export function LiveUsers({ organisationId }: { organisationId: string }) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const links = useKnownUsers(organisationId);
  const cached = useCachedUsers(organisationId);
  const [selection, setSelection] = useState<Selection>();

  const list = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );
  const read = useOperation(
    (variables: Target, signal) => workflows.users.info(variables.organisationId, variables.userId, { signal }),
    (result, variables) => {
      if (result.data) store.rememberUser(variables.organisationId, variables.userId, result.data);
    },
  );
  const change = useOperation(
    (variables: Target & { operations: readonly PatchOperation[] }, signal) => workflows.users.change(variables.organisationId, variables.userId, variables.operations, { signal }),
    (result, variables) => {
      if (result.data) store.rememberUser(variables.organisationId, variables.userId, result.data);
      read.reset();
      setSelection({ mode: "view", id: variables.userId });
    },
  );
  const create = useOperation(
    (variables: { organisationId: string; input: CreateUserInput }, signal) => workflows.users.create(variables.organisationId, variables.input, { signal }),
    (result, variables) => {
      if (result.data) store.rememberUser(variables.organisationId, variables.input.id, result.data);
      setSelection({ mode: "view", id: variables.input.id });
    },
  );
  const remove = useOperation(
    (variables: Target, signal) => workflows.users.remove(variables.organisationId, variables.userId, { signal }),
    (_result, variables) => {
      store.unlinkUser(variables.organisationId, variables.userId);
      store.forgetUser(variables.organisationId, variables.userId);
      setSelection(undefined);
    },
  );

  const loadList = useEffectEvent((id: string) => list.start(id));
  useEffect(() => {
    loadList(organisationId);
  }, [organisationId]);

  const choose = (next: Selection) => {
    for (const operation of [read, change, create, remove]) operation.reset();
    setSelection(next);
    // What is shown or edited is read again, so that the form starts from the registry's current state.
    if (next && next.mode !== "create" && next.mode !== "delete") read.start({ organisationId, userId: next.id });
  };

  const rows: UserRow[] = links.map((link) => ({ ...link, user: cached.get(link.id) }));
  const chosen = selection && selection.mode !== "create" ? cached.get(selection.id) : undefined;
  const busy = change.pending || create.pending || remove.pending;

  return (
    <div className="flex flex-col gap-6">
      <UsersToolbar onAdd={() => choose({ mode: "create" })}>
        <Button variant="secondary" disabled={list.pending} onClick={() => list.start(organisationId)}>
          <RefreshCw aria-hidden />
          {t("users.action.reload")}
        </Button>
      </UsersToolbar>

      {/* The list itself is the success; only its progress and a failure are told. */}
      {!list.result && <OperationOutcome operation={list} success="" />}
      <OperationOutcome operation={remove} success={t("organisations.outcome.userDeleted", { user: remove.variables?.userId ?? "", organisation: organisationId })} />

      {(list.result || links.length > 0) && <UsersTable organisationId={organisationId} rows={rows} selection={selection} busy={busy} onSelect={choose} />}

      {selection && (
        <UserPanel selection={selection} organisationId={organisationId} onClose={() => choose(undefined)}>
          {selection.mode === "create" && (
            <>
              <UserCreateForm pending={create.pending} existing={links.map((link) => link.id)} onCreate={(input) => create.start({ organisationId, input })} onCancel={() => choose(undefined)} />
              <OperationOutcome operation={create} success={t("organisations.outcome.userCreated", { user: create.variables?.input.id ?? "", organisation: organisationId })} />
            </>
          )}
          {selection.mode === "view" && (
            <>
              <OperationOutcome operation={change} success={t("organisations.outcome.userChanged", { user: selection.id, organisation: organisationId })} />
              <OperationOutcome operation={create} success={t("organisations.outcome.userCreated", { user: selection.id, organisation: organisationId })} />
              <OperationOutcome operation={read} success={t("organisations.outcome.userLoaded", { user: selection.id })} />
              {chosen && !read.pending && <UserDetails user={chosen} />}
            </>
          )}
          {selection.mode === "edit" && (
            <>
              <OperationOutcome operation={read} success={t("organisations.outcome.userLoaded", { user: selection.id })} />
              {chosen && !read.pending && (
                <UserEditForm
                  key={selection.id}
                  user={chosen}
                  pending={change.pending}
                  onSave={(operations) => change.start({ organisationId, userId: selection.id, operations })}
                  onCancel={() => choose(undefined)}
                />
              )}
              <OperationOutcome operation={change} success={t("organisations.outcome.userChanged", { user: selection.id, organisation: organisationId })} />
            </>
          )}
          {selection.mode === "delete" && (
            <>
              <UserDeleteConfirm
                organisationId={organisationId}
                userId={selection.id}
                pending={remove.pending}
                description={t("organisations.userDelete.confirmDescription", { user: selection.id, organisation: organisationId })}
                onConfirm={() => remove.start({ organisationId, userId: selection.id })}
                onCancel={() => choose(undefined)}
              />
            </>
          )}
        </UserPanel>
      )}
    </div>
  );
}
