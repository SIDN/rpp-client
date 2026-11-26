import { Plus, X } from "lucide-react";
import { t } from "@/i18n";
import { useId } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import {
  CONTACT_TYPES,
  EMPTY_ROLE,
  ORGANISATION_CLIENT_STATUSES,
  ROLE_CLIENT_STATUS,
  ROLE_TYPES,
} from "@/application/organisations/organisationData";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { ContactLookup } from "../shared/ContactLookup";
import { CardFields } from "./parts";
import type { OrganisationValues } from "./organisationValues";

function Roles() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<OrganisationValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "roles" });
  const list = useId();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">{t("organisations.fields.roles")}</legend>
      <p className="text-sm text-muted-foreground">{t("organisations.fields.rolesHint")}</p>
      <datalist id={list}>
        {ROLE_TYPES.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>
      {fields.map((field, index) => {
        const problem = errors.roles?.[index]?.name?.message;
        return (
          <div key={field.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("organisations.fields.role", { number: index + 1 })} error={problem}>
                {(control) => (
                  <Input
                    {...control}
                    list={list}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="registrar"
                    {...register(`roles.${index}.name`, {
                      validate: (value, values) =>
                        value.trim() === ""
                          ? t("organisations.validation.roleType")
                          : values.roles.filter((role) => role.name.trim() === value.trim()).length === 1 || t("organisations.validation.roleDuplicate", { name: value.trim() }),
                    })}
                  />
                )}
              </Field>
              <Field label={t("organisations.fields.roleIdentifier", { number: index + 1 })} hint={t("organisations.fields.roleIdentifierHint")}>
                {(control) => <Input {...control} autoComplete="off" spellCheck={false} {...register(`roles.${index}.roleId`)} />}
              </Field>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Choice type="checkbox" label={t("organisations.fields.prohibitRoleLink", { number: index + 1 })} hint={<code>{ROLE_CLIENT_STATUS}</code>} {...register(`roles.${index}.linkProhibited`)} />
              <Button variant="ghost" size="icon" aria-label={t("organisations.fields.removeRole", { number: index + 1 })} disabled={fields.length === 1} onClick={() => remove(index)}>
                <X aria-hidden />
              </Button>
            </div>
          </div>
        );
      })}
      <div>
        <Button variant="secondary" size="sm" onClick={() => append({ ...EMPTY_ROLE })}>
          <Plus aria-hidden />
          {t("organisations.fields.addRole")}
        </Button>
      </div>
    </fieldset>
  );
}

function Contacts() {
  const {
    control,
    register,
    setValue,
    formState: { errors },
  } = useFormContext<OrganisationValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "contacts" });
  const list = useId();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">{t("organisations.fields.contacts")}</legend>
      <p className="text-sm text-muted-foreground">{t("organisations.fields.contactsHint")}</p>
      <datalist id={list}>
        {CONTACT_TYPES.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-start gap-2">
          <Field label={t("organisations.fields.contactType", { number: index + 1 })} error={errors.contacts?.[index]?.label?.message} className="w-40">
            {(control) => (
              <Input
                {...control}
                list={list}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="admin"
                {...register(`contacts.${index}.label`, {
                  validate: (value, values) => values.contacts[index]?.id.trim() === "" || value.trim() !== "" || t("organisations.validation.contactType"),
                })}
              />
            )}
          </Field>
          <Field label={t("organisations.fields.contactIdentifier", { number: index + 1 })} error={errors.contacts?.[index]?.id?.message} className="flex-1">
            {(control) => (
              <Input
                {...control}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="font-mono"
                {...register(`contacts.${index}.id`, {
                  validate: (value, values) => values.contacts[index]?.label.trim() === "" || value.trim() !== "" || t("organisations.validation.contactIdentifier"),
                })}
              />
            )}
          </Field>
          <div className="mt-7">
            <ContactLookup label={t("organisations.fields.lookupContact", { number: index + 1 })} onSelect={(id) => setValue(`contacts.${index}.id`, id, { shouldDirty: true, shouldValidate: true })} />
          </div>
          <Button variant="ghost" size="icon" aria-label={t("organisations.fields.removeContact", { number: index + 1 })} className="mt-7" onClick={() => remove(index)}>
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" onClick={() => append({ label: "", id: "" })}>
          <Plus aria-hidden />
          {t("organisations.fields.addContact")}
        </Button>
      </div>
    </fieldset>
  );
}

/** The members of an organisation a registrar fills in; the form it sits in holds `OrganisationValues`. */
export function OrganisationFields() {
  const { register } = useFormContext<OrganisationValues>();
  return (
    <div className="flex flex-col gap-8">
      <Roles />
      <Field label={t("organisations.fields.parentOrganisation")} hint={t("organisations.fields.parentOrganisationHint")}>
        {(control) => <Input {...control} autoComplete="off" autoCapitalize="none" spellCheck={false} className="max-w-96 font-mono" {...register("parent")} />}
      </Field>
      <CardFields legend={t("organisations.fields.contactInformation")} nameLabel={t("organisations.fields.name")} />
      <Contacts />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{t("organisations.fields.locksSetByYou")}</legend>
        {ORGANISATION_CLIENT_STATUSES.map((label) => (
          <Choice key={label} type="checkbox" value={label} label={<code>{label}</code>} {...register("clientStatuses")} />
        ))}
        <p className="text-sm text-muted-foreground">{t("organisations.fields.registryStatusesHint")}</p>
      </fieldset>
    </div>
  );
}
