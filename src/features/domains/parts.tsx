import { t } from "@/i18n";
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
      label={t("domains.nameField.label")}
      hint={ref?.unicode ? <>{t("domains.nameField.sentAs")}<code>{ref.name}</code>{t("domains.nameField.alabelForm")}</> : t("domains.nameField.placeholder")}
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
  return /^[1-9]\d{0,2}$/.test(value.trim()) ? true : t("domains.period.positiveInteger");
};

/** The period of a registration, renewal or transfer; left empty, the registry's default applies. */
export function PeriodFields({ label }: { label?: string }) {
  const resolvedLabel = label ?? t("domains.period.label");
  const {
    register,
    formState: { errors },
  } = useFormContext<PeriodValues>();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">{resolvedLabel}</legend>
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          aria-label={t("domains.period.numberAria", { label: resolvedLabel })}
          aria-invalid={errors.periodValue ? true : undefined}
          placeholder={t("domains.period.registryDefault")}
          className="max-w-44"
          {...register("periodValue", { validate: positiveInteger })}
        />
        <Select aria-label={t("domains.period.unitAria", { label: resolvedLabel })} className="max-w-32" {...register("periodUnit")}>
          <option value="y">{t("domains.period.years")}</option>
          <option value="m">{t("domains.period.months")}</option>
        </Select>
      </div>
      <p className="text-sm text-muted-foreground">{t("domains.period.leaveEmpty")}</p>
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
      <legend className="mb-1 text-sm font-medium">{t("domains.contacts.other")}</legend>
      {fields.length === 0 && <p className="text-sm text-muted-foreground">{t("domains.contacts.none")}</p>}
      {fields.map((field, index) => {
        const problem = errors.contacts?.[index]?.label?.message ?? errors.contacts?.[index]?.id?.message;
        // A contact the domain already has under another role keeps it, so that saving does not change it.
        const kept = field.label !== "" && !(CONTACT_ROLES as readonly string[]).includes(field.label) ? field.label : undefined;
        return (
          <div key={field.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={t("domains.contacts.roleAria", { number: index + 1 })}
                aria-invalid={errors.contacts?.[index]?.label ? true : undefined}
                className="max-w-40"
                {...register(`contacts.${index}.label`, {
                  validate: (label, values) => label !== "" || values.contacts[index]?.id.trim() === "" || t("domains.contacts.chooseRoleError"),
                })}
              >
                <option value="">{t("domains.contacts.chooseRole")}</option>
                {CONTACT_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
                {kept && <option value={kept}>{kept}</option>}
              </Select>
              <Input
                aria-label={t("domains.contacts.idAria", { number: index + 1 })}
                aria-invalid={errors.contacts?.[index]?.id ? true : undefined}
                placeholder={t("domains.contacts.idPlaceholder")}
                className="max-w-52 font-mono"
                spellCheck={false}
                {...register(`contacts.${index}.id`, {
                  validate: (id, values) => id.trim() !== "" || values.contacts[index]?.label === "" || t("domains.contacts.idRequired"),
                })}
              />
              <div className="flex items-center gap-2">
                <ContactLookup label={t("domains.contacts.lookup", { number: index + 1 })} onSelect={(id) => setValue(`contacts.${index}.id`, id, { shouldDirty: true, shouldValidate: true })} />
                <Button variant="ghost" size="icon" aria-label={t("domains.contacts.remove", { number: index + 1 })} onClick={() => remove(index)}>
                  <X aria-hidden />
                </Button>
              </div>
            </div>
            {problem && <p className="text-sm font-medium text-danger-ink">{problem}</p>}
          </div>
        );
      })}
      <div>
        <Button variant="secondary" size="sm" onClick={() => append({ label: "", id: "" })}>
          <Plus aria-hidden />
          {t("domains.contacts.add")}
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
      <legend className="mb-1 text-sm font-medium">{t("domains.nameservers.label")}</legend>
      {fields.length === 0 && <p className="text-sm text-muted-foreground">{t("domains.nameservers.none")}</p>}
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-center gap-2">
          <Input aria-label={t("domains.nameservers.aria", { number: index + 1 })} placeholder={t("domains.nameservers.placeholder")} className="max-w-96 font-mono" spellCheck={false} autoCapitalize="none" {...register(`nameservers.${index}.host`)} />
          <Button variant="ghost" size="icon" aria-label={t("domains.nameservers.remove", { number: index + 1 })} onClick={() => remove(index)}>
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" onClick={() => append({ host: "" })}>
          <Plus aria-hidden />
          {t("domains.nameservers.add")}
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
      <Field label={t("domains.contacts.registrant")} hint={t("domains.contacts.registrantHint")}>
        {(control) => (
          <div className="flex flex-wrap items-center gap-2">
            <Input {...control} spellCheck={false} className="max-w-64 font-mono" {...register("registrant")} />
            <ContactLookup label={t("domains.contacts.lookupRegistrant")} onSelect={(id) => setValue("registrant", id, { shouldDirty: true })} />
          </div>
        )}
      </Field>
      <ContactFields />
      <NameserverFields />
    </div>
  );
}
