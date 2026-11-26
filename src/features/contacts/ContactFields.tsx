import { useFormContext, useWatch } from "react-hook-form";
import { PHONE_PATTERN, type AddressType } from "@/application/contacts/contactCard";
import { Field, Input, Select } from "@/components/ui/field";
import { t } from "@/i18n";
import { STREET_FIELDS, type ContactValues } from "./formValues";

const filled = (value: string | undefined) => (value ?? "").trim() !== "";

const phoneRule = (value: string) => value.trim() === "" || PHONE_PATTERN.test(value.trim()) || t("contacts.form.phoneFormat");

const ASCII = /^[\x20-\x7e]*$/;

const FORMS: Record<AddressType, { name: "address" | "localAddress" }> = {
  int: { name: "address" },
  loc: { name: "localAddress" },
};

function addressFieldLabel(type: AddressType, field: "street" | "city" | "region" | "postcode" | "country", line?: number): string {
  if (type === "int") {
    switch (field) {
      case "street": return t("contacts.form.address.streetLine", { line: line ?? 1 });
      case "city": return t("contacts.form.address.city");
      case "region": return t("contacts.form.address.region");
      case "postcode": return t("contacts.form.address.postcode");
      case "country": return t("contacts.form.address.country");
    }
  }
  switch (field) {
    case "street": return t("contacts.form.localizedAddress.streetLine", { line: line ?? 1 });
    case "city": return t("contacts.form.localizedAddress.city");
    case "region": return t("contacts.form.localizedAddress.region");
    case "postcode": return t("contacts.form.localizedAddress.postcode");
    case "country": return t("contacts.form.localizedAddress.country");
  }
}

/** One address form. The international one takes plain ASCII only; the localized one takes any characters. */
function AddressFields({ type, shown }: { type: AddressType; shown: boolean }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<ContactValues>();
  const { name } = FORMS[type];
  const own = errors[name];
  const ascii = type === "int" ? (value: string) => ASCII.test(value) || t("contacts.form.address.asciiOnly") : undefined;

  return (
    <div hidden={!shown} className="flex flex-col gap-4">
      {STREET_FIELDS.map((field, index) => (
        <Field key={field} label={addressFieldLabel(type, "street", index + 1)} error={own?.[field]?.message}>
          {(control) => <Input {...control} autoComplete="off" {...register(`${name}.${field}`, { validate: ascii })} />}
        </Field>
      ))}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={addressFieldLabel(type, "city")} error={own?.city?.message}>
          {(control) => <Input {...control} autoComplete="off" {...register(`${name}.city`, { validate: ascii })} />}
        </Field>
        <Field label={addressFieldLabel(type, "region")} error={own?.region?.message}>
          {(control) => <Input {...control} autoComplete="off" {...register(`${name}.region`, { validate: ascii })} />}
        </Field>
        <Field label={addressFieldLabel(type, "postcode")} error={own?.postcode?.message}>
          {(control) => <Input {...control} autoComplete="off" className="max-w-48" {...register(`${name}.postcode`, { validate: ascii })} />}
        </Field>
        <Field label={addressFieldLabel(type, "country")} hint={t("contacts.form.address.countryHint")} error={own?.country?.message}>
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              spellCheck={false}
              maxLength={2}
              className="max-w-24 font-mono"
              {...register(`${name}.country`, {
                validate: (country, values) => {
                  const address = values[name];
                  const code = country.trim();
                  const hasAddress = [address.street1, address.street2, address.street3, address.city, address.region, address.postcode].some(filled);
                  if (code === "") return hasAddress ? (type === "int" ? t("contacts.form.address.countryRequired") : t("contacts.form.localizedAddress.countryRequired")) : true;
                  return /^[A-Z]{2}$/.test(code) || t("contacts.form.address.countryFormat");
                },
              })}
            />
          )}
        </Field>
      </div>
    </div>
  );
}

/**
 * The members of a contact a registrar fills in. `withKind` offers the kind, which cannot be changed afterwards.
 * `addresses`: `both` shows the international and the localized address together, `localized` the localized one alone (for a
 * registry that keeps no other), `international` the international one alone (likewise), `choose` has a list pick which of
 * the two is on view.
 */
export function ContactFields({ withKind = false, addresses = "choose" }: { withKind?: boolean; addresses?: "choose" | "both" | "localized" | "international" }) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<ContactValues>();
  const addressType = useWatch({ control, name: "addressType" });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <Field label={t("contacts.form.name")} error={errors.name?.message}>
          {(field) => <Input {...field} autoComplete="off" {...register("name")} />}
        </Field>
        <Field label={t("contacts.form.organisation")} error={errors.organisation?.message}>
          {(field) => <Input {...field} autoComplete="off" className="max-w-96" {...register("organisation")} />}
        </Field>
        {withKind && (
          <Field label={t("contacts.form.kind")} hint={t("contacts.form.kindHint")}>
            {(field) => (
              <Select {...field} className="max-w-48" {...register("kind")}>
                <option value="">{t("contacts.form.kindNotSpecified")}</option>
                <option value="individual">{t("contacts.form.kindIndividual")}</option>
                <option value="org">{t("contacts.form.kindOrganisation")}</option>
              </Select>
            )}
          </Field>
        )}
      </div>

      {addresses === "localized" ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 font-medium">{t("contacts.form.address")}</legend>
          <p className="text-sm text-muted-foreground">{t("contacts.form.localizedOnlyDescription")}</p>
          <AddressFields type="loc" shown />
        </fieldset>
      ) : addresses === "international" ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 font-medium">{t("contacts.form.address")}</legend>
          <p className="text-sm text-muted-foreground">{t("contacts.form.internationalOnlyDescription")}</p>
          <AddressFields type="int" shown />
        </fieldset>
      ) : addresses === "both" ? (
        <>
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 font-medium">{t("contacts.form.internationalAddress")}</legend>
            <p className="text-sm text-muted-foreground">{t("contacts.form.internationalAddressDescription")}</p>
            <AddressFields type="int" shown />
          </fieldset>
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 font-medium">{t("contacts.form.localizedAddress")}</legend>
            <p className="text-sm text-muted-foreground">{t("contacts.form.localizedAddressDescription")}</p>
            <AddressFields type="loc" shown />
          </fieldset>
        </>
      ) : (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 font-medium">{t("contacts.form.address")}</legend>
          <Field label={t("contacts.form.addressType")} hint={t("contacts.form.addressTypeHint")}>
            {(field) => (
              <Select {...field} className="max-w-72" {...register("addressType")}>
                <option value="int">{t("contacts.form.internationalOption")}</option>
                <option value="loc">{t("contacts.form.localizedOption")}</option>
              </Select>
            )}
          </Field>
          <AddressFields type="int" shown={addressType === "int"} />
          <AddressFields type="loc" shown={addressType === "loc"} />
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 font-medium">{t("contacts.form.reachContact")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("contacts.form.phone")} hint={t("contacts.form.phoneHint")} error={errors.voice?.message}>
            {(field) => <Input {...field} type="tel" autoComplete="off" spellCheck={false} className="font-mono" {...register("voice", { validate: phoneRule })} />}
          </Field>
          <Field label={t("contacts.form.fax")} error={errors.fax?.message}>
            {(field) => <Input {...field} type="tel" autoComplete="off" spellCheck={false} className="font-mono" {...register("fax", { validate: phoneRule })} />}
          </Field>
        </div>
        <Field label={t("contacts.form.email")} error={errors.email?.message}>
          {(field) => (
            <Input
              {...field}
              type="email"
              autoComplete="off"
              spellCheck={false}
              className="max-w-96"
              {...register("email", { validate: (email) => email.trim() === "" || /^[^\s@]+@[^\s@]+$/.test(email.trim()) || t("contacts.form.emailInvalid") })}
            />
          )}
        </Field>
      </fieldset>
    </div>
  );
}
