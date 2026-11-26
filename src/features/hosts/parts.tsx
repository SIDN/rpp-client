import { Plus, X } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { ipVersionOf } from "@/application/hosts/hostData";
import { tryParseHostName } from "@/application/hosts/hostWorkflows";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { t } from "@/i18n";

/** What every host workflow panel receives: the host name being worked on, which the panels share. */
export interface PanelProps {
  name: string;
  onNameChange(name: string): void;
}

export interface AddressValues {
  addresses: { value: string }[];
}

/** The host name field every workflow starts with; it shows what the name comes to in a URL when that is not the name itself. */
export function NameField({ name, onNameChange }: PanelProps) {
  const ref = tryParseHostName(name);
  return (
    <Field
      label={t("hosts.form.name")}
      hint={ref?.unicode ? <>{t("hosts.form.name.sentAs")} <code>{ref.name}</code>, {t("hosts.form.name.alabelDescription")}</> : t("hosts.form.name.hint")}
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

/** The IP addresses of a host, as many as it has. Each is checked as an IPv4 or IPv6 address before anything is sent. */
export function AddressFields({ hint }: { hint: string }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<AddressValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "addresses" });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{t("hosts.form.addresses")}</legend>
      <p className="text-sm text-muted-foreground">{hint}</p>
      {fields.map((field, index) => {
        const problem = errors.addresses?.[index]?.value?.message;
        return (
          <div key={field.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                aria-label={t("hosts.form.addressLabel", { index: index + 1 })}
                aria-invalid={problem ? true : undefined}
                placeholder="192.0.2.1 or 2001:db8::1"
                className="max-w-96 font-mono"
                spellCheck={false}
                autoCapitalize="none"
                {...register(`addresses.${index}.value`, {
                  validate: (value) => value.trim() === "" || ipVersionOf(value) !== undefined || t("hosts.form.invalidAddress"),
                })}
              />
              <Button variant="ghost" size="icon" aria-label={t("hosts.form.removeAddressLabel", { index: index + 1 })} onClick={() => remove(index)}>
                <X aria-hidden />
              </Button>
            </div>
            {problem && <p className="text-sm font-medium text-danger-ink">{problem}</p>}
          </div>
        );
      })}
      <div>
        <Button variant="secondary" size="sm" onClick={() => append({ value: "" })}>
          <Plus aria-hidden />
          {t("hosts.form.addAddress")}
        </Button>
      </div>
    </fieldset>
  );
}
