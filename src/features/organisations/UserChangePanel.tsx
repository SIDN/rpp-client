import { useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { buildUserPatch, describeUserOperation, userEditOf } from "@/application/organisations/userData";
import { Callout } from "@/components/ui/callout";
import type { User } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation, type Operation } from "../shared/useOperation";
import { useCachedOrganisation, useCachedUser, useKnownUsers, useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { OrganisationField, type PanelProps } from "./parts";
import { UserDetails } from "./UserDetails";
import { UserFields } from "./UserFields";
import { UserTable } from "./UserTable";
import { toData, toValues, type UserValues } from "./userValues";

interface Target {
  organisationId: string;
  userId: string;
}

interface Change extends Target {
  operations: readonly PatchOperation[];
}

function ChangeForm({ target, user, change }: { target: Target; user: User; change: Operation<Change, User> }) {
  const form = useForm<UserValues>({ defaultValues: toValues(userEditOf(user)) });
  const values = useWatch({ control: form.control });
  const operations = buildUserPatch(user, toData(values as Partial<UserValues>));

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => change.start({ ...target, operations }))} noValidate className="flex max-w-xl flex-col gap-8">
        <h3>
          Change <code>{user.id}</code> of <code>{target.organisationId}</code>
        </h3>

        <UserFields statusHint="The registry sets the other statuses itself. Leaving this as it is keeps the current status." />

        <section aria-label="Changes to send" className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h4 className="font-semibold">Changes to send</h4>
          {operations.length === 0 ? (
            <p className="text-muted-foreground">Nothing has been changed yet.</p>
          ) : (
            <ul className="list-disc pl-5">
              {operations.map((operation, index) => (
                <li key={index}>{describeUserOperation(operation)}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            Only these changes are sent, as one partial update that the registry carries out completely or not at all. The registry decides which of them it allows.
          </p>
        </section>

        <div>
          <SubmitButton pending={change.pending} disabled={operations.length === 0}>
            Save changes
          </SubmitButton>
        </div>
      </form>
    </FormProvider>
  );
}

export function UserChangePanel({ organisationId, onOrganisationChange, onUserChange }: PanelProps) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const organisation = useCachedOrganisation(organisationId);
  const users = useKnownUsers(organisationId);
  const [selected, setSelected] = useState<string>();
  const user = useCachedUser(organisationId, selected ?? "");

  const loadUsers = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );
  const load = useOperation(
    (variables: Target, signal) => workflows.users.info(variables.organisationId, variables.userId, { signal }),
    (result, variables) => {
      if (result.data) store.rememberUser(variables.organisationId, variables.userId, result.data);
    },
  );
  // Held here, not in the form: the form starts over when the saved user replaces the loaded one.
  const change = useOperation(
    (variables: Change, signal) => workflows.users.change(variables.organisationId, variables.userId, variables.operations, { signal }),
    (result, variables) => {
      if (result.data) store.rememberUser(variables.organisationId, variables.userId, result.data);
    },
  );

  const choose = (id: string) => {
    setSelected(id);
    onUserChange(id);
    load.start({ organisationId: organisationId.trim(), userId: id });
  };

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          loadUsers.start(organisationId);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <OrganisationField
          organisationId={organisationId}
          onOrganisationChange={(id) => {
            setSelected(undefined);
            onOrganisationChange(id);
          }}
          hint="The organisation whose user you want to change."
        />
        <div>
          <SubmitButton pending={loadUsers.pending}>{organisation ? "Load the users again" : "Show the users"}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={loadUsers} success={`Loaded ${loadUsers.variables?.trim() || "the organisation"}`} />

      {organisationId.trim() !== "" && (organisation || users.length > 0) && (
        <section aria-label="Users" className="flex flex-col gap-3">
          <h3>Users of {organisationId.trim()}</h3>
          <UserTable organisationId={organisationId.trim()} users={users} selected={selected} busy={load.pending} action="Edit" onSelect={choose} />
        </section>
      )}
      {!organisation && users.length === 0 && !loadUsers.pending && !loadUsers.failure && !loadUsers.cancelled && !loadUsers.result && (
        <Callout tone="info" title="Show the users of an organisation to pick one">
          The users the organisation lists appear here. Choose one to change it.
        </Callout>
      )}

      <OperationOutcome operation={load} success={`Loaded ${load.variables?.userId ?? "the user"}`} />
      {selected && user && !load.pending && (
        <ChangeForm
          key={JSON.stringify([organisationId.trim(), selected, userEditOf(user)])}
          target={{ organisationId: organisationId.trim(), userId: selected }}
          user={user}
          change={change}
        />
      )}
      <OperationOutcome operation={change} success={`Changed ${change.variables?.userId ?? "the user"} in ${change.variables?.organisationId ?? "the organisation"}`}>
        {(changed) => <UserDetails user={changed} />}
      </OperationOutcome>
    </div>
  );
}
