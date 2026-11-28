import { t } from "@/i18n";
import type { ReactNode } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cardDataOf } from "@/application/organisations/card";
import { buildUserPatch, describeUserOperation, EMPTY_USER, userEditOf, type CreateUserInput } from "@/application/organisations/userData";
import { StatusLabel } from "@/components/protocol/protocol-badges";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { isJsonObject } from "@/rpp/core/types/json";
import type { User } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { ConfirmAction } from "../shared/ConfirmAction";
import { DirectoryPanel } from "../shared/DirectoryPanel";
import { SubmitButton } from "../shared/SubmitButton";
import { UserFields } from "./UserFields";
import { toData, toValues, type UserValues } from "./userValues";

/** What the panel under the table shows: one user to look at, edit or delete, or a new one to add. */
export type Selection = { mode: "view" | "edit" | "delete"; id: string } | { mode: "create" } | undefined;

/** A user as the table lists it; `user` is there once its details are known. */
export interface UserRow {
  id: string;
  label: string;
  user?: User;
}

const statusOf = (user: User): string | undefined => (isJsonObject(user.status) && typeof user.status.label === "string" ? user.status.label : undefined);

const selectedId = (selection: Selection) => (selection && selection.mode !== "create" ? selection.id : undefined);

function Unknown({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

/** Every user of the organisation, one to a row: the identifier shows the user, and each row can be edited or deleted. */
export function UsersTable({ organisationId, rows, selection, busy, onSelect }: { organisationId: string; rows: readonly UserRow[]; selection: Selection; busy: boolean; onSelect(selection: Selection): void }) {
  if (rows.length === 0) {
    return (
      <Callout tone="info" title={t("users.table.emptyTitle")}>
        {t("users.table.emptyDescription")}
      </Callout>
    );
  }
  const current = selectedId(selection);
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("users.table.caption", { organisation: organisationId })}</caption>
        <thead className="bg-muted/50 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">{t("users.table.id")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("users.table.name")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("users.table.status")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("users.table.role")}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              <span className="sr-only">{t("users.table.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const chosen = row.id === current;
            const name = row.user ? cardDataOf(row.user.details).name : undefined;
            const status = row.user ? statusOf(row.user) : undefined;
            return (
              <tr key={row.id} aria-current={chosen ? "true" : undefined} className={chosen ? "bg-muted/70 shadow-[inset_3px_0_0_var(--color-primary)]" : "hover:bg-muted/30"}>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="rounded-sm font-mono text-primary underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={() => onSelect({ mode: "view", id: row.id })}
                  >
                    {row.id}
                  </button>
                </td>
                <td className="px-3 py-2">{row.user ? name || <Unknown>{t("organisations.value.notGiven")}</Unknown> : <Unknown>{t("users.table.notRead")}</Unknown>}</td>
                <td className="px-3 py-2">{status ? <StatusLabel type="userStatus" label={status} /> : <Unknown>{row.user ? t("organisations.value.notGiven") : t("users.table.notRead")}</Unknown>}</td>
                <td className="px-3 py-2">{row.label || <Unknown>{t("users.table.notListed")}</Unknown>}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" disabled={busy} aria-label={t("users.table.editUser", { id: row.id })} onClick={() => onSelect({ mode: "edit", id: row.id })}>
                      <Pencil aria-hidden />
                      {t("users.table.edit")}
                    </Button>
                    <Button variant="secondary" size="sm" disabled={busy} className="text-danger-ink" aria-label={t("users.table.deleteUser", { id: row.id })} onClick={() => onSelect({ mode: "delete", id: row.id })}>
                      <Trash2 aria-hidden />
                      {t("users.table.delete")}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The list's own actions, above it. */
export function UsersToolbar({ onAdd, children }: { onAdd(): void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onAdd}>
        <Plus aria-hidden />
        {t("users.action.add")}
      </Button>
      {children}
    </div>
  );
}

/** Where the chosen user is shown, under the table. */
export function UserPanel({ selection, organisationId, onClose, children }: { selection: Exclude<Selection, undefined>; organisationId: string; onClose(): void; children: ReactNode }) {
  return (
    <DirectoryPanel title={panelTitle(selection, organisationId)} focusKey={JSON.stringify(selection)} closeLabel={t("users.action.close")} onClose={onClose}>
      {children}
    </DirectoryPanel>
  );
}

function panelTitle(selection: Exclude<Selection, undefined>, organisationId: string): string {
  switch (selection.mode) {
    case "view":
      return t("users.panel.view", { user: selection.id });
    case "edit":
      return t("organisations.userChange.heading", { user: selection.id, organisation: organisationId });
    case "delete":
      return t("organisations.userDelete.confirm", { user: selection.id });
    case "create":
      return t("users.panel.create", { organisation: organisationId });
  }
}

/** The details, description and status of a user, with the partial update they come to before it is sent. */
export function UserEditForm({ user, pending, onSave, onCancel }: { user: User; pending: boolean; onSave(operations: PatchOperation[]): void; onCancel(): void }) {
  const form = useForm<UserValues>({ defaultValues: toValues(userEditOf(user)) });
  const values = useWatch({ control: form.control });
  const operations = buildUserPatch(user, toData(values as Partial<UserValues>));

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => onSave(operations))} noValidate className="flex max-w-xl flex-col gap-8">
        <UserFields statusHint={t("organisations.userChange.statusHint")} />

        <section aria-label={t("organisations.change.preview")} className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h3 className="font-semibold">{t("organisations.change.preview")}</h3>
          {operations.length === 0 ? (
            <p className="text-muted-foreground">{t("organisations.change.noChanges")}</p>
          ) : (
            <ul className="list-disc pl-5">
              {operations.map((operation, index) => (
                <li key={index}>{describeUserOperation(operation)}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">{t("organisations.change.previewHint")}</p>
        </section>

        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending} disabled={operations.length === 0}>
            {t("organisations.action.saveChanges")}
          </SubmitButton>
          <Button variant="secondary" onClick={onCancel}>
            {t("users.action.cancel")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

interface CreateValues extends UserValues {
  id: string;
}

/** A new user of the organisation; its identifier is chosen here and cannot be changed later. */
export function UserCreateForm({ pending, onCreate, onCancel, existing }: { pending: boolean; onCreate(input: CreateUserInput): void; onCancel(): void; existing: readonly string[] }) {
  const form = useForm<CreateValues>({ defaultValues: { id: "", ...toValues(EMPTY_USER) } });
  const error = form.formState.errors.id?.message;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(({ id, ...values }) => onCreate({ id: id.trim(), data: toData(values) }))} noValidate className="flex max-w-xl flex-col gap-8">
        <Field label={t("organisations.field.userId")} hint={t("organisations.userCreate.userIdHint")} error={error}>
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="max-w-96 font-mono"
              {...form.register("id", {
                validate: (value) => {
                  const id = value.trim();
                  if (id === "") return t("organisations.validation.userId");
                  if (existing.includes(id)) return t("users.validation.exists", { id });
                  return true;
                },
              })}
            />
          )}
        </Field>
        <UserFields statusHint={t("organisations.userCreate.statusHint")} />
        <Callout tone="info" title={t("organisations.create.requirementsTitle")}>
          {t("organisations.userCreate.requirementsDescription")}
        </Callout>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending}>{t("organisations.action.createUser")}</SubmitButton>
          <Button variant="secondary" onClick={onCancel}>
            {t("users.action.cancel")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

/** Asks before a user is deleted; the identifier has to be typed, so that a click on the wrong row does nothing. */
export function UserDeleteConfirm({ organisationId, userId, pending, onConfirm, onCancel, description }: { organisationId: string; userId: string; pending: boolean; onConfirm(): void; onCancel(): void; description: string }) {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Callout tone="warning" title={t("organisations.userDelete.irreversibleTitle")}>
        {t("organisations.userDelete.onlyUser", { user: userId, organisation: organisationId })}
      </Callout>
      <ConfirmAction
        key={userId}
        startOpen
        destructive
        trigger={t("users.table.delete")}
        title={t("organisations.userDelete.confirmTitle", { user: userId, organisation: organisationId })}
        confirmLabel={t("organisations.userDelete.confirm", { user: userId })}
        expected={userId}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        {description}
      </ConfirmAction>
    </div>
  );
}
