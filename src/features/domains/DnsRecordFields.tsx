import { Plus, X } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  EDITABLE_RECORD_TYPES,
  isDelegationType,
  recordProblems,
  type EditableRecordType,
  type RecordField,
} from "@/application/domains/dnsRecords";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { isFilled, recordInputOf, type DnsRecordRow, type DnsRecordValues } from "./dnsRecordValues";
import type { DomainDataValues } from "./parts";

const VALUE_FIELD: Record<EditableRecordType, RecordField> = { ns: "nsdname", a: "address", aaaa: "address", mx: "exchange" };

const VALUE_LABEL: Record<EditableRecordType, { label: string; placeholder: string }> = {
  ns: { label: "Name server", placeholder: "ns1.example.net" },
  a: { label: "IPv4 address", placeholder: "192.0.2.1" },
  aaaa: { label: "IPv6 address", placeholder: "2001:db8::1" },
  mx: { label: "Mail server", placeholder: "mail.example.net" },
};

const NEW_ROW: Record<EditableRecordType, DnsRecordRow> = {
  ns: { type: "ns", name: "@", value: "", preference: "" },
  a: { type: "a", name: "", value: "", preference: "" },
  aaaa: { type: "aaaa", name: "", value: "", preference: "" },
  mx: { type: "mx", name: "@", value: "", preference: "10" },
};

type Values = DnsRecordValues & Pick<DomainDataValues, "nameservers">;

/**
 * The NS, A, AAAA and MX records of the DNS Data element. NS records with A/AAAA glue delegate the domain without
 * host objects; the draft does not allow them next to name servers given as hosts.
 */
export function DnsRecordFields({ domain }: { domain: string }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<Values>();
  const { fields, append, remove } = useFieldArray({ control, name: "dnsRecords" });
  const rows = useWatch({ control, name: "dnsRecords" }) ?? [];
  const nameservers = useWatch({ control, name: "nameservers" }) ?? [];
  const hasHosts = nameservers.some((server) => server?.host?.trim());
  const hasRecords = rows.some((row) => row && isFilled(row));
  const hasDelegation = rows.some((row) => row && isFilled(row) && isDelegationType(row.type));

  const problemOf = (index: number, field: RecordField) => (values: Values): true | string => {
    const row = values.dnsRecords[index];
    if (!row || !isFilled(row)) return true;
    return recordProblems(recordInputOf(row), domain)[field] ?? true;
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">DNS records</legend>
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          None. To delegate without hosts, add NS records here instead of name servers, with A or AAAA glue records for name servers inside the domain.
        </p>
      )}
      {fields.map((field, index) => {
        const row = rows[index] ?? field;
        const rowErrors = errors.dnsRecords?.[index];
        const problem = rowErrors?.type?.message ?? rowErrors?.name?.message ?? rowErrors?.preference?.message ?? rowErrors?.value?.message;
        const valueLabel = VALUE_LABEL[row.type];
        return (
          <div key={field.id} role="group" aria-label={`DNS record ${index + 1}`} className="flex flex-col">
            <div className="flex flex-wrap items-start gap-2">
              <Field label="Type" className="w-24">
                {(controlProps) => (
                  <Select
                    {...controlProps}
                    {...register(`dnsRecords.${index}.type`, {
                      validate: (type, values) => {
                        const filledRow = values.dnsRecords[index];
                        if (!filledRow || !isFilled(filledRow) || !values.nameservers.some((server) => server.host.trim())) return true;
                        return isDelegationType(type)
                          ? "Remove the name servers above to delegate with NS records, or remove this record"
                          : "DNS records cannot be sent with name servers given as hosts";
                      },
                    })}
                  >
                    {EDITABLE_RECORD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.toUpperCase()}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Name" className="w-36">
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    placeholder={row.type === "a" || row.type === "aaaa" ? "ns1" : "@"}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="font-mono"
                    {...register(`dnsRecords.${index}.name`, { validate: (_, values) => problemOf(index, "name")(values) })}
                  />
                )}
              </Field>
              {row.type === "mx" && (
                <Field label="Preference" className="w-24">
                  {(controlProps) => (
                    <Input
                      {...controlProps}
                      inputMode="numeric"
                      autoComplete="off"
                      className="font-mono"
                      {...register(`dnsRecords.${index}.preference`, { validate: (_, values) => problemOf(index, "preference")(values) })}
                    />
                  )}
                </Field>
              )}
              <Field label={valueLabel.label} className="min-w-40 flex-1">
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    placeholder={valueLabel.placeholder}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="font-mono"
                    {...register(`dnsRecords.${index}.value`, { validate: (_, values) => problemOf(index, VALUE_FIELD[values.dnsRecords[index]?.type ?? "ns"])(values) })}
                  />
                )}
              </Field>
              <Button variant="ghost" size="icon" aria-label={`Remove DNS record ${index + 1}`} className="mt-7 shrink-0" onClick={() => remove(index)}>
                <X aria-hidden />
              </Button>
            </div>
            {problem && <p className="text-sm font-medium text-danger-ink">{problem}</p>}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => append(NEW_ROW.ns)}>
          <Plus aria-hidden />
          Add an NS record
        </Button>
        <Button variant="secondary" size="sm" onClick={() => append(NEW_ROW.a)}>
          <Plus aria-hidden />
          Add a glue record
        </Button>
        <Button variant="secondary" size="sm" onClick={() => append(NEW_ROW.mx)}>
          <Plus aria-hidden />
          Add an MX record
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Name: <code>@</code> for the domain itself, a name relative to it (<code>ns1</code>), or an absolute name ending in a dot. The registry decides which
        record types it accepts.
      </p>
      {hasHosts && hasRecords && (
        <p role="alert" className="text-sm font-medium text-danger-ink">
          {hasDelegation ? "Delegate with name servers (hosts) or with NS records, not both." : "DNS records cannot be sent with name servers given as hosts."}
        </p>
      )}
    </fieldset>
  );
}
