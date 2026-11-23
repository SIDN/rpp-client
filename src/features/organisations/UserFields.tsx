import { useFormContext } from "react-hook-form";
import { USER_CLIENT_STATUSES } from "@/application/organisations/userData";
import { Field, Input, Select } from "@/components/ui/field";
import { CardFields } from "./parts";
import type { UserValues } from "./userValues";

/** The members of a user a registrar fills in; the form it sits in holds `UserValues`. */
export function UserFields({ statusHint }: { statusHint: string }) {
  const { register } = useFormContext<UserValues>();
  return (
    <div className="flex flex-col gap-8">
      <CardFields legend="Details" nameLabel="Name of the user" />
      <Field label="Description" hint="Optional.">
        {(control) => <Input {...control} autoComplete="off" {...register("description")} />}
      </Field>
      <Field label="Status" hint={statusHint}>
        {(control) => (
          <Select {...control} className="max-w-64" {...register("status")}>
            <option value="">Leave to the registry</option>
            {USER_CLIENT_STATUSES.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}
