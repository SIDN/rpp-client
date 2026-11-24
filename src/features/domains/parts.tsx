import { Plus, X } from "lucide-react";
import { useFormContext, useFieldArray } from "react-hook-form";
import { CONTACT_ROLES, tryParseDomainName } from "@/application/domains/domainWorkflows";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ContactLookup } from "../shared/ContactLookup";

/** What every workflow panel receives: the name being worked on, which the panels share. */
export interface PanelProps {
  name: string;
  onNameChange(name: string): void;
}

export interface PeriodValues {
  periodValue: string;
  periodUnit: "y" | "m";
}

export interface DomainDataValues {
  registrant: string;
  contacts: { label: string; id: string }[];
  nameservers: { host: string }[];
}

/** The domain name field every workflow starts with; it shows what the name comes to in a URL when that is not the name itself. */
export function NameField({ name, onNameChange }: PanelProps) {
  const ref = tryParseDomainName(name);
  return (
    <Field
      label="Domain name"
      hint={ref?.unicode ? <>Sent as <code>{ref.name}</code>, the A-label form the protocol takes.</> : "for example example.nl"}
    >
      {(control) => (
        <Input
          {...control}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="font-mono"
        />
      )}
    </Field>
  );
}

const positiveInteger = (value: string): true | string => {
  if (value.trim() === "") return true;
  return /^[1-9]\d{0,2}$/.test(value.trim()) ? true : "Use a whole number of 1 or more";
};

/** The period of a registration, renewal or transfer; left empty, the registry's default applies. */
export function PeriodFields({ label = "Period" }: { label?: string }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<PeriodValues>();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          aria-label={`${label}, number`}
          aria-invalid={errors.periodValue ? true : undefined}
          placeholder="Registry default"
          className="max-w-44"
          {...register("periodValue", { validate: positiveInteger })}
        />
        <Select aria-label={`${label}, unit`} className="max-w-32" {...register("periodUnit")}>
          <option value="y">years</option>
          <option value="m">months</option>
        </Select>
      </div>
      <p className="text-sm text-muted-foreground">Leave empty to use the period the registry sets by default.</p>
      {errors.periodValue?.message && <p className="text-sm font-medium text-danger-ink">{errors.periodValue.message}</p>}
    </fieldset>
  );
}

function ContactFields() {
  const {
    control,
    register,
    setValue,
    formState: { errors },
  } = useFormContext<DomainDataValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "contacts" });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Other contacts</legend>
      {fields.length === 0 && <p className="text-sm text-muted-foreground">None. A contact has a role (admin, billing or tech) and the identifier of an existing contact.</p>}
      {fields.map((field, index) => {
        const problem = errors.contacts?.[index]?.label?.message ?? errors.contacts?.[index]?.id?.message;
        // A contact the domain already has under another role keeps it, so that saving does not change it.
        const kept = field.label !== "" && !(CONTACT_ROLES as readonly string[]).includes(field.label) ? field.label : undefined;
        return (
          <div key={field.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={`Role of contact ${index + 1}`}
                aria-invalid={errors.contacts?.[index]?.label ? true : undefined}
                className="max-w-40"
                {...register(`contacts.${index}.label`, {
                  validate: (label, values) => label !== "" || values.contacts[index]?.id.trim() === "" || "Choose a role",
                })}
              >
                <option value="">Choose a role</option>
                {CONTACT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
                {kept && <option value={kept}>{kept}</option>}
              </Select>
              <Input
                aria-label={`Identifier of contact ${index + 1}`}
                aria-invalid={errors.contacts?.[index]?.id ? true : undefined}
                placeholder="Contact identifier"
                className="max-w-64 font-mono"
                spellCheck={false}
                {...register(`contacts.${index}.id`, {
                  validate: (id, values) => id.trim() !== "" || values.contacts[index]?.label === "" || "Enter the contact identifier",
                })}
              />
              <ContactLookup label={`Look up contact ${index + 1}`} onSelect={(id) => setValue(`contacts.${index}.id`, id, { shouldDirty: true, shouldValidate: true })} />
              <Button variant="ghost" size="icon" aria-label={`Remove contact ${index + 1}`} onClick={() => remove(index)}>
                <X aria-hidden />
              </Button>
            </div>
            {problem && <p className="text-sm font-medium text-danger-ink">{problem}</p>}
          </div>
        );
      })}
      <div>
        <Button variant="secondary" size="sm" onClick={() => append({ label: "", id: "" })}>
          <Plus aria-hidden />
          Add a contact
        </Button>
      </div>
    </fieldset>
  );
}

function NameserverFields() {
  const { control, register } = useFormContext<DomainDataValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "nameservers" });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Name servers</legend>
      {fields.length === 0 && <p className="text-sm text-muted-foreground">None. A name server is the name of an existing host.</p>}
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-center gap-2">
          <Input aria-label={`Name server ${index + 1}`} placeholder="ns1.example.nl" className="max-w-96 font-mono" spellCheck={false} autoCapitalize="none" {...register(`nameservers.${index}.host`)} />
          <Button variant="ghost" size="icon" aria-label={`Remove name server ${index + 1}`} onClick={() => remove(index)}>
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" onClick={() => append({ host: "" })}>
          <Plus aria-hidden />
          Add a name server
        </Button>
      </div>
    </fieldset>
  );
}

/** The registrant, the other contacts and the name servers: what a registration and a change have in common. */
export function DomainDataFields() {
  const { register, setValue } = useFormContext<DomainDataValues>();
  return (
    <div className="flex flex-col gap-6">
      <Field label="Registrant" hint="The identifier of an existing contact. Look it up to fill it in.">
        {(control) => (
          <div className="flex flex-wrap items-center gap-2">
            <Input {...control} spellCheck={false} className="max-w-64 font-mono" {...register("registrant")} />
            <ContactLookup label="Look up the registrant" onSelect={(id) => setValue("registrant", id, { shouldDirty: true })} />
          </div>
        )}
      </Field>
      <ContactFields />
      <NameserverFields />
    </div>
  );
}
