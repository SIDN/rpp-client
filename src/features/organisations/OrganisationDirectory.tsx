import { t } from "@/i18n";
import { useState, type ReactNode } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cardDataOf } from "@/application/organisations/card";
import { organisationTree, type TreeRow } from "@/application/organisations/organisationTree";
import {
  buildOrganisationPatch,
  describeOrganisationOperation,
  EMPTY_ORGANISATION,
  organisationEditOf,
  rolesOf,
  userLinksOf,
  type CreateOrganisationInput,
  type OrganisationData,
} from "@/application/organisations/organisationData";
import { StatusLabel } from "@/components/protocol/protocol-badges";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { isJsonObject } from "@/rpp/core/types/json";
import type { Organisation } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { ConfirmAction } from "../shared/ConfirmAction";
import { DirectoryPanel } from "../shared/DirectoryPanel";
import { SubmitButton } from "../shared/SubmitButton";
import { OrganisationFields } from "./OrganisationFields";
import { toData, toValues, type OrganisationValues } from "./organisationValues";
import type { Selection } from "./UserDirectory";

export type { Selection } from "./UserDirectory";

const statusesOf = (organisation: Organisation): string[] =>
  (Array.isArray(organisation.status) ? organisation.status : []).flatMap((status) => (isJsonObject(status) && typeof status.label === "string" ? [status.label] : []));

const selectedId = (selection: Selection) => (selection && selection.mode !== "create" ? selection.id : undefined);

function Unknown({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

/** Horizontal geometry of the tree lines, in pixels: the cell padding and the width of one level. */
const PAD = 12;
const STEP = 20;
const lineAt = (level: number) => PAD + (level - 1) * STEP + 8;
const LINE = "pointer-events-none absolute bg-muted-foreground/40";

/**
 * The lines in front of an identifier: one for each level above that goes on to a later sibling, the elbow to this row,
 * and a stub down to its first child. A detached row gets a dashed stub instead of an elbow.
 */
function TreeLines({ row, hasChildren }: { row: TreeRow; hasChildren: boolean }) {
  const x = lineAt(row.depth);
  return (
    <span aria-hidden>
      {row.guides.map((goesOn, index) => (goesOn ? <span key={index} className={`${LINE} inset-y-0 w-px`} style={{ left: lineAt(index + 1) }} /> : null))}
      {row.attached ? (
        <>
          <span className={`${LINE} top-0 w-px`} style={{ left: x, bottom: row.last ? "50%" : 0 }} />
          <span className={`${LINE} top-1/2 h-px w-2.5`} style={{ left: x }} />
        </>
      ) : (
        <span className="pointer-events-none absolute top-1/2 w-2.5 border-t border-dashed border-muted-foreground/60" style={{ left: x }} />
      )}
      {hasChildren && <span className={`${LINE} bottom-0 w-px`} style={{ left: lineAt(row.depth + 1), top: "calc(50% + 0.625rem)" }} />}
    </span>
  );
}

function placeOf(row: TreeRow, rootId: string): string {
  if (row.attached) return t("organisations.tree.under", { level: row.depth, parent: row.parentId ?? rootId });
  return row.parentId === undefined || row.parentId === row.organisation.id ? t("organisations.tree.noParent") : t("organisations.tree.detached", { parent: row.parentId });
}

/**
 * The organisations under `parentId`, one to a row and drawn as a tree: each directly below its parent, indented one
 * level further and joined to it by a line. The identifier shows the organisation, and each row can be edited or deleted.
 */
export function OrganisationsTable({ parentId, organisations, selection, busy, onSelect }: { parentId: string; organisations: readonly Organisation[]; selection: Selection; busy: boolean; onSelect(selection: Selection): void }) {
  if (organisations.length === 0) {
    return (
      <Callout tone="info" title={t("organisations.table.emptyTitle")}>
        {t("organisations.table.emptyDescription", { parent: parentId })}
      </Callout>
    );
  }
  const current = selectedId(selection);
  const rows = organisationTree(parentId, organisations);
  const rootHasChildren = rows.some((row) => row.attached && row.depth === 1);
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("organisations.table.caption", { parent: parentId })}</caption>
        <thead className="bg-muted/50 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">{t("organisations.table.id")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("organisations.table.name")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("organisations.table.status")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("organisations.table.roles")}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t("organisations.table.users")}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              <span className="sr-only">{t("organisations.table.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <tr data-root="" className="bg-muted/20">
            <th scope="row" className="relative py-2.5 text-left font-normal whitespace-nowrap" style={{ paddingLeft: PAD + STEP + 4, paddingRight: PAD }}>
              <span aria-hidden className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" style={{ left: lineAt(1) + 0.5 }} />
              {rootHasChildren && <span aria-hidden className={`${LINE} bottom-0 w-px`} style={{ left: lineAt(1), top: "50%" }} />}
              <span className="font-mono font-semibold">{parentId}</span>
            </th>
            <td colSpan={5} className="px-3 py-2.5 text-muted-foreground">
              {t("organisations.tree.root")}
            </td>
          </tr>
          {rows.map((row, index) => {
            const { organisation } = row;
            const chosen = organisation.id === current;
            const name = cardDataOf(organisation.contactInfo).name;
            const statuses = statusesOf(organisation);
            const roles = rolesOf(organisation).map((role) => role.name);
            const next = rows[index + 1];
            const hasChildren = next !== undefined && next.attached && next.depth > row.depth;
            return (
              <tr key={organisation.id} aria-current={chosen ? "true" : undefined} className={chosen ? "bg-muted/70 shadow-[inset_3px_0_0_var(--color-primary)]" : "hover:bg-muted/30"}>
                <td className="relative py-2 whitespace-nowrap" style={{ paddingLeft: PAD + row.depth * STEP + 4, paddingRight: PAD }}>
                  <TreeLines row={row} hasChildren={hasChildren} />
                  <button
                    type="button"
                    className="rounded-sm font-mono text-primary underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={() => onSelect({ mode: "view", id: organisation.id })}
                  >
                    {organisation.id}
                  </button>
                  <span className={row.attached ? "sr-only" : "ml-2 text-xs text-muted-foreground"}>
                    {row.attached ? `, ${placeOf(row, parentId)}` : placeOf(row, parentId)}
                  </span>
                </td>
                <td className="px-3 py-2">{name || <Unknown>{t("organisations.value.notGiven")}</Unknown>}</td>
                <td className="px-3 py-2">
                  {statuses.length === 0 ? (
                    <Unknown>{t("organisations.value.notGiven")}</Unknown>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {statuses.map((label) => (
                        <StatusLabel key={label} type="organisationStatus" label={label} />
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{roles.length === 0 ? <Unknown>{t("organisations.value.notGiven")}</Unknown> : <code>{roles.join(", ")}</code>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{userLinksOf(organisation).length}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" disabled={busy} aria-label={t("organisations.table.editOrganisation", { id: organisation.id })} onClick={() => onSelect({ mode: "edit", id: organisation.id })}>
                      <Pencil aria-hidden />
                      {t("organisations.table.edit")}
                    </Button>
                    <Button variant="secondary" size="sm" disabled={busy} className="text-danger-ink" aria-label={t("organisations.table.deleteOrganisation", { id: organisation.id })} onClick={() => onSelect({ mode: "delete", id: organisation.id })}>
                      <Trash2 aria-hidden />
                      {t("organisations.table.delete")}
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
export function OrganisationsToolbar({ onAdd, children }: { onAdd(): void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onAdd}>
        <Plus aria-hidden />
        {t("organisations.action.add")}
      </Button>
      {children}
    </div>
  );
}

function panelTitle(selection: Exclude<Selection, undefined>, parentId: string): string {
  switch (selection.mode) {
    case "view":
      return t("organisations.panel.view", { id: selection.id });
    case "edit":
      return t("organisations.change.heading", { id: selection.id });
    case "delete":
      return t("organisations.delete.confirm", { id: selection.id });
    case "create":
      return t("organisations.panel.create", { parent: parentId });
  }
}

/** Where the chosen organisation is shown, under the table. */
export function OrganisationPanel({ selection, parentId, onClose, children }: { selection: Exclude<Selection, undefined>; parentId: string; onClose(): void; children: ReactNode }) {
  return (
    <DirectoryPanel title={panelTitle(selection, parentId)} focusKey={JSON.stringify(selection)} closeLabel={t("organisations.action.close")} onClose={onClose}>
      {children}
    </DirectoryPanel>
  );
}

/** The operations for what is typed so far, or why there are none yet: a form half filled in is not an error. */
function planOf(organisation: Organisation, data: OrganisationData): { operations: PatchOperation[]; problem?: string } {
  try {
    return { operations: buildOrganisationPatch(organisation, data) };
  } catch (error) {
    return { operations: [], problem: error instanceof Error ? error.message : String(error) };
  }
}

/** The roles, parent, contact information, contacts and locks of an organisation, with the partial update they come to. */
export function OrganisationEditForm({ organisation, pending, onSave, onCancel }: { organisation: Organisation; pending: boolean; onSave(operations: PatchOperation[]): void; onCancel(): void }) {
  const form = useForm<OrganisationValues>({ defaultValues: toValues(organisationEditOf(organisation)) });
  const values = useWatch({ control: form.control });
  const { operations, problem } = planOf(organisation, toData(values as Partial<OrganisationValues>));

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => onSave(operations))} noValidate className="flex max-w-xl flex-col gap-8">
        <OrganisationFields />
        <p className="text-sm text-muted-foreground">{t("organisations.change.usersHint")}</p>

        <section aria-label={t("organisations.change.preview")} className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h3 className="font-semibold">{t("organisations.change.preview")}</h3>
          {problem ? (
            <p className="text-muted-foreground">{t("organisations.form.problem", { message: problem })}</p>
          ) : operations.length === 0 ? (
            <p className="text-muted-foreground">{t("organisations.change.noChanges")}</p>
          ) : (
            <ul className="list-disc pl-5">
              {operations.map((operation, index) => (
                <li key={index}>{describeOrganisationOperation(operation)}</li>
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
            {t("organisations.action.cancel")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

interface CreateValues extends OrganisationValues {
  id: string;
}

/** A new organisation, under the current one unless another parent is typed; its identifier cannot be changed later. */
export function OrganisationCreateForm({ parentId, existing, pending, onCreate, onCancel }: { parentId: string; existing: readonly string[]; pending: boolean; onCreate(input: CreateOrganisationInput): void; onCancel(): void }) {
  const form = useForm<CreateValues>({ defaultValues: { id: "", ...toValues({ ...EMPTY_ORGANISATION, parent: parentId }) } });
  const error = form.formState.errors.id?.message;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(({ id, ...values }) => onCreate({ id: id.trim(), data: toData(values) }))} noValidate className="flex max-w-xl flex-col gap-8">
        <Field label={t("organisations.field.organisationId")} hint={t("organisations.create.idHint")} error={error}>
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
                  if (id === "") return t("organisations.validation.organisationId");
                  if (existing.includes(id)) return t("organisations.validation.exists", { id });
                  return true;
                },
              })}
            />
          )}
        </Field>
        <OrganisationFields />
        <Callout tone="info" title={t("organisations.create.usersAfterwardTitle")}>
          {t("organisations.create.usersAfterwardDescription")}
        </Callout>
        <Callout tone="info" title={t("organisations.create.requirementsTitle")}>
          {t("organisations.create.requirementsDescription")}
        </Callout>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending}>{t("organisations.action.createOrganisation")}</SubmitButton>
          <Button variant="secondary" onClick={onCancel}>
            {t("organisations.action.cancel")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

/**
 * Asks before an organisation is deleted. An organisation that lists users is only deleted with them, when that is
 * chosen here; the identifier has to be typed, so that a click on the wrong row does nothing.
 */
export function OrganisationDeleteConfirm({ organisation, pending, description, onConfirm, onCancel }: { organisation: Organisation; pending: boolean; description(deleteUsers: boolean, noun: string): string; onConfirm(deleteUsers: boolean): void; onCancel(): void }) {
  const [deleteUsers, setDeleteUsers] = useState(false);
  const { id } = organisation;
  const users = userLinksOf(organisation).map((user) => user.id);
  const noun = users.length === 1 ? t("organisations.delete.userCount.one") : t("organisations.delete.userCount.other", { count: users.length });
  const allowed = users.length === 0 || deleteUsers;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <section aria-label={t("organisations.delete.beforeDeleting")} className="flex flex-col gap-4">
        {users.length === 0 ? (
          <Callout tone="info" title={t("organisations.delete.noUsersTitle")}>
            {t("organisations.delete.onlyOrganisation", { id })}
          </Callout>
        ) : (
          <>
            <Callout tone="warning" title={t("organisations.delete.hasUsers", { noun })}>
              <ul className="list-disc pl-5">
                {users.map((user) => (
                  <li key={user}>
                    <code>{user}</code>
                  </li>
                ))}
              </ul>
              <p className="mt-2">{t("organisations.delete.usersMustBeDeletedFirst")}</p>
            </Callout>
            <Choice
              type="checkbox"
              label={t("organisations.delete.deleteUsersLabel")}
              hint={t("organisations.delete.deleteUsersHint")}
              checked={deleteUsers}
              onChange={(event) => setDeleteUsers(event.target.checked)}
            />
            {deleteUsers ? (
              <Callout tone="warning" title={t("organisations.delete.usersWillAlsoBeDeleted", { noun })}>
                {t("organisations.delete.irreversibleDescription")}
              </Callout>
            ) : (
              <p className="text-sm text-muted-foreground">{t("organisations.delete.deleteUsersAlternative")}</p>
            )}
          </>
        )}
      </section>

      {allowed ? (
        <ConfirmAction
          key={`${id}-${String(deleteUsers)}`}
          startOpen
          destructive
          trigger={t("organisations.table.delete")}
          title={t("organisations.delete.confirmTitle", { id })}
          confirmLabel={t("organisations.delete.confirm", { id })}
          expected={id}
          pending={pending}
          onConfirm={() => onConfirm(deleteUsers)}
          onCancel={onCancel}
        >
          {description(users.length > 0, noun)}
        </ConfirmAction>
      ) : (
        <div>
          <Button variant="secondary" onClick={onCancel}>
            {t("organisations.action.cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}
