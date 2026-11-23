import { Plus, X } from "lucide-react";
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
      <legend className="mb-1 text-sm font-medium">Roles</legend>
      <p className="text-sm text-muted-foreground">What the organisation is in the registry, such as a registrar or a reseller. At least one is needed.</p>
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
              <Field label={`Role ${index + 1}`} error={problem}>
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
                          ? "Give the role a type"
                          : values.roles.filter((role) => role.name.trim() === value.trim()).length === 1 || `The role ${value.trim()} is given twice`,
                    })}
                  />
                )}
              </Field>
              <Field label={`Role ${index + 1} identifier`} hint="Optional, such as an IANA ID for a registrar.">
                {(control) => <Input {...control} autoComplete="off" spellCheck={false} {...register(`roles.${index}.roleId`)} />}
              </Field>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Choice type="checkbox" label={`Prohibit linking to role ${index + 1}`} hint={<code>{ROLE_CLIENT_STATUS}</code>} {...register(`roles.${index}.linkProhibited`)} />
              <Button variant="ghost" size="icon" aria-label={`Remove role ${index + 1}`} disabled={fields.length === 1} onClick={() => remove(index)}>
                <X aria-hidden />
              </Button>
            </div>
          </div>
        );
      })}
      <div>
        <Button variant="secondary" size="sm" onClick={() => append({ ...EMPTY_ROLE })}>
          <Plus aria-hidden />
          Add a role
        </Button>
      </div>
    </fieldset>
  );
}

function Contacts() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<OrganisationValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "contacts" });
  const list = useId();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Contacts</legend>
      <p className="text-sm text-muted-foreground">Contacts that already exist in the registry, by type.</p>
      <datalist id={list}>
        {CONTACT_TYPES.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-start gap-2">
          <Field label={`Contact ${index + 1} type`} error={errors.contacts?.[index]?.label?.message} className="w-40">
            {(control) => (
              <Input
                {...control}
                list={list}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="admin"
                {...register(`contacts.${index}.label`, {
                  validate: (value, values) => values.contacts[index]?.id.trim() === "" || value.trim() !== "" || "Give the contact a type",
                })}
              />
            )}
          </Field>
          <Field label={`Contact ${index + 1} identifier`} error={errors.contacts?.[index]?.id?.message} className="flex-1">
            {(control) => (
              <Input
                {...control}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="font-mono"
                {...register(`contacts.${index}.id`, {
                  validate: (value, values) => values.contacts[index]?.label.trim() === "" || value.trim() !== "" || "Give the contact an identifier",
                })}
              />
            )}
          </Field>
          <Button variant="ghost" size="icon" aria-label={`Remove contact ${index + 1}`} className="mt-7" onClick={() => remove(index)}>
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" onClick={() => append({ label: "", id: "" })}>
          <Plus aria-hidden />
          Add a contact
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
      <Field label="Parent organisation" hint="The identifier of the organisation this one belongs to, such as a reseller's registrar. Optional.">
        {(control) => <Input {...control} autoComplete="off" autoCapitalize="none" spellCheck={false} className="max-w-96 font-mono" {...register("parent")} />}
      </Field>
      <CardFields legend="Contact information" nameLabel="Name" />
      <Contacts />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Locks set by you</legend>
        {ORGANISATION_CLIENT_STATUSES.map((label) => (
          <Choice key={label} type="checkbox" value={label} label={<code>{label}</code>} {...register("clientStatuses")} />
        ))}
        <p className="text-sm text-muted-foreground">Statuses the registry sets itself cannot be changed here.</p>
      </fieldset>
    </div>
  );
}
