import { useFormContext, useWatch } from "react-hook-form";
import { PHONE_PATTERN, type AddressType } from "@/application/contacts/contactCard";
import { Field, Input, Select } from "@/components/ui/field";
import { STREET_FIELDS, type ContactValues } from "./formValues";

const filled = (value: string | undefined) => (value ?? "").trim() !== "";

const phoneRule = (value: string) => value.trim() === "" || PHONE_PATTERN.test(value.trim()) || "Use +CC.number, like +31.201234567";

const ASCII = /^[\x20-\x7e]*$/;

const FORMS: Record<AddressType, { name: "address" | "localAddress"; prefix: string }> = {
  int: { name: "address", prefix: "" },
  loc: { name: "localAddress", prefix: "Localized " },
};

/** One address form. The international one takes plain ASCII only; the localized one takes any characters. */
function AddressFields({ type, shown }: { type: AddressType; shown: boolean }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<ContactValues>();
  const { name, prefix } = FORMS[type];
  const own = errors[name];
  const ascii = type === "int" ? (value: string) => ASCII.test(value) || "Use plain ASCII here; put other characters in the localized address" : undefined;
  const lower = prefix.toLowerCase();

  return (
    <div hidden={!shown} className="flex flex-col gap-4">
      {STREET_FIELDS.map((field, index) => (
        <Field key={field} label={`${prefix}${prefix ? "street" : "Street"}, line ${index + 1}`} error={own?.[field]?.message}>
          {(control) => <Input {...control} autoComplete="off" {...register(`${name}.${field}`, { validate: ascii })} />}
        </Field>
      ))}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${prefix}${prefix ? "city" : "City"}`} error={own?.city?.message}>
          {(control) => <Input {...control} autoComplete="off" {...register(`${name}.city`, { validate: ascii })} />}
        </Field>
        <Field label={`${prefix}${prefix ? "state or region" : "State or region"}`} error={own?.region?.message}>
          {(control) => <Input {...control} autoComplete="off" {...register(`${name}.region`, { validate: ascii })} />}
        </Field>
        <Field label={`${prefix}${prefix ? "postal code" : "Postal code"}`} error={own?.postcode?.message}>
          {(control) => <Input {...control} autoComplete="off" className="max-w-48" {...register(`${name}.postcode`, { validate: ascii })} />}
        </Field>
        <Field label={`${prefix}${prefix ? "country code" : "Country code"}`} hint="Two capital letters, like NL." error={own?.country?.message}>
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
                  if (code === "") return hasAddress ? `Enter the ${lower}country code` : true;
                  return /^[A-Z]{2}$/.test(code) || "Use two capital letters, like NL";
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
        <Field label="Name" error={errors.name?.message}>
          {(field) => <Input {...field} autoComplete="off" {...register("name")} />}
        </Field>
        <Field label="Organisation" error={errors.organisation?.message}>
          {(field) => <Input {...field} autoComplete="off" className="max-w-96" {...register("organisation")} />}
        </Field>
        {withKind && (
          <Field label="Kind" hint="Not every registry keeps it. Left empty, the registry decides.">
            {(field) => (
              <Select {...field} className="max-w-48" {...register("kind")}>
                <option value="">Not specified</option>
                <option value="individual">Individual</option>
                <option value="org">Organisation</option>
              </Select>
            )}
          </Field>
        )}
      </div>

      {addresses === "localized" ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 font-medium">Address</legend>
          <p className="text-sm text-muted-foreground">This registry keeps the localized form only, so the name, the organisation and the address are sent in it. Any characters are allowed.</p>
          <AddressFields type="loc" shown />
        </fieldset>
      ) : addresses === "international" ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 font-medium">Address</legend>
          <p className="text-sm text-muted-foreground">This registry keeps the international form only. Plain ASCII only.</p>
          <AddressFields type="int" shown />
        </fieldset>
      ) : addresses === "both" ? (
        <>
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 font-medium">International address (int)</legend>
            <p className="text-sm text-muted-foreground">Plain ASCII only. Most registries require it.</p>
            <AddressFields type="int" shown />
          </fieldset>
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 font-medium">Localized address (loc)</legend>
            <p className="text-sm text-muted-foreground">Any characters, for the address as it is written locally. Optional.</p>
            <AddressFields type="loc" shown />
          </fieldset>
        </>
      ) : (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 font-medium">Address</legend>
          <Field label="Address type" hint="International (int) is plain ASCII, and most registries require it. Localized (loc) may use any characters. Both are kept: this chooses which one you edit.">
            {(field) => (
              <Select {...field} className="max-w-72" {...register("addressType")}>
                <option value="int">International (int)</option>
                <option value="loc">Localized (loc)</option>
              </Select>
            )}
          </Field>
          <AddressFields type="int" shown={addressType === "int"} />
          <AddressFields type="loc" shown={addressType === "loc"} />
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 font-medium">How to reach the contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" hint="As +CC.number, with xEXT for an extension." error={errors.voice?.message}>
            {(field) => <Input {...field} type="tel" autoComplete="off" spellCheck={false} className="font-mono" {...register("voice", { validate: phoneRule })} />}
          </Field>
          <Field label="Fax" error={errors.fax?.message}>
            {(field) => <Input {...field} type="tel" autoComplete="off" spellCheck={false} className="font-mono" {...register("fax", { validate: phoneRule })} />}
          </Field>
        </div>
        <Field label="Email" error={errors.email?.message}>
          {(field) => (
            <Input
              {...field}
              type="email"
              autoComplete="off"
              spellCheck={false}
              className="max-w-96"
              {...register("email", { validate: (email) => email.trim() === "" || /^[^\s@]+@[^\s@]+$/.test(email.trim()) || "Enter an email address" })}
            />
          )}
        </Field>
      </fieldset>
    </div>
  );
}
