import { Plus, X } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import type { DnskeyRdata, DnssecInput, DsRdata } from "@/application/domains/domainWorkflows";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export interface DnssecValues {
  dsRecords: DsRdata[];
  keyRecords: DnskeyRdata[];
  /** Seconds; empty to leave it to the server. */
  maxSigLife: string;
}

export const DNSSEC_DEFAULTS: DnssecValues = { dsRecords: [], keyRecords: [], maxSigLife: "" };

const EMPTY_DS: DsRdata = { keyTag: "", algorithm: "", digestType: "", digest: "" };
const EMPTY_KEY: DnskeyRdata = { flags: "", protocol: "", algorithm: "", publicKey: "" };

const trimmed = (record: Record<string, string>) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value.trim()]));
const isFilled = (record: Record<string, string>) => Object.values(record).some((value) => value.trim() !== "");

/** Only one kind is sent: the form does not let both be entered. Rows left empty are not sent. */
export function dnssecOf(values: DnssecValues): DnssecInput | undefined {
  const ds = values.dsRecords.filter(isFilled).map((record) => trimmed(record) as DsRdata);
  const keys = values.keyRecords.filter(isFilled).map((record) => trimmed(record) as DnskeyRdata);
  const seconds = values.maxSigLife.trim();
  const maxSigLife = seconds === "" ? {} : { maxSigLife: Number(seconds) };
  if (ds.length > 0) return { type: "ds", records: ds, ...maxSigLife };
  return keys.length > 0 ? { type: "dnskey", records: keys, ...maxSigLife } : undefined;
}

const integer = (label: string) => (value: string) => (/^\d{1,5}$/.test(value.trim()) ? true : `${label}: use a whole number`);

interface Column {
  name: string;
  label: string;
  width: string;
  check: (value: string) => true | string;
}

const DS_COLUMNS: Column[] = [
  { name: "keyTag", label: "Key tag", width: "w-24", check: integer("Key tag") },
  { name: "algorithm", label: "Algorithm", width: "w-24", check: integer("Algorithm") },
  { name: "digestType", label: "Digest type", width: "w-28", check: integer("Digest type") },
  { name: "digest", label: "Digest", width: "min-w-0 flex-1", check: (value) => (/^[0-9a-fA-F]+$/.test(value.trim()) ? true : "Digest: use hexadecimal digits") },
];

const KEY_COLUMNS: Column[] = [
  { name: "flags", label: "Flags", width: "w-24", check: integer("Flags") },
  { name: "protocol", label: "Protocol", width: "w-24", check: integer("Protocol") },
  { name: "algorithm", label: "Algorithm", width: "w-24", check: integer("Algorithm") },
  { name: "publicKey", label: "Public key", width: "min-w-0 flex-1", check: (value) => value.trim() !== "" || "Public key: enter the key" },
];

function Records({ kind, fields, onRemove }: { kind: "ds" | "dnskey"; fields: { id: string }[]; onRemove(index: number): void }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<DnssecValues>();
  const arrayName = kind === "ds" ? "dsRecords" : "keyRecords";
  const columns = kind === "ds" ? DS_COLUMNS : KEY_COLUMNS;
  const noun = kind === "ds" ? "DS record" : "DNSKEY record";
  return (
    <>
      {fields.map((field, index) => {
        const rowErrors = errors[arrayName]?.[index] as Record<string, { message?: string }> | undefined;
        const problem = Object.values(rowErrors ?? {}).find((error) => error?.message)?.message;
        return (
          <div key={field.id} role="group" aria-label={`${noun} ${index + 1}`} className="flex flex-col">
            <div className="flex items-start gap-2">
              {columns.map((column) => (
                <Field key={column.name} label={column.label} className={column.width}>
                  {(control) => (
                    <Input
                      {...control}
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono"
                      {...register(`${arrayName}.${index}.${column.name}` as `dsRecords.${number}.keyTag`, { validate: column.check })}
                    />
                  )}
                </Field>
              ))}
              <Button variant="ghost" size="icon" aria-label={`Remove ${noun} ${index + 1}`} className="mt-7 shrink-0" onClick={() => onRemove(index)}>
                <X aria-hidden />
              </Button>
            </div>
            {problem && <p className="text-sm font-medium text-danger-ink">{problem}</p>}
          </div>
        );
      })}
    </>
  );
}

/** The DNS Data of a registration, holding either DS records or DNSKEY records, never both. */
export function DnssecFields() {
  const { control, register } = useFormContext<DnssecValues>();
  const ds = useFieldArray({ control, name: "dsRecords" });
  const keys = useFieldArray({ control, name: "keyRecords" });
  const hasDs = ds.fields.length > 0;
  const hasKeys = keys.fields.length > 0;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">DNSSEC</legend>
      {!hasDs && !hasKeys && <p className="text-sm text-muted-foreground">None. Add DS records or DNSKEY records, not both.</p>}
      <Records kind="ds" fields={ds.fields} onRemove={ds.remove} />
      <Records kind="dnskey" fields={keys.fields} onRemove={keys.remove} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={hasKeys} onClick={() => ds.append(EMPTY_DS)}>
          <Plus aria-hidden />
          Add a DS record
        </Button>
        <Button variant="secondary" size="sm" disabled={hasDs} onClick={() => keys.append(EMPTY_KEY)}>
          <Plus aria-hidden />
          Add a DNSKEY record
        </Button>
      </div>
      {(hasDs || hasKeys) && (
        <Field label="Max signature life (seconds)" hint="How long the signature over these records may live. The server may ignore it." className="max-w-64">
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              autoComplete="off"
              {...register("maxSigLife", { validate: (value) => value.trim() === "" || (/^[1-9]\d{0,9}$/.test(value.trim()) ? true : "Max signature life: use a whole number of seconds, at least 1") })}
            />
          )}
        </Field>
      )}
      {(hasDs || hasKeys) && (
        <p className="text-sm text-muted-foreground">
          {hasDs ? "Remove the DS records to add DNSKEY records instead." : "Remove the DNSKEY records to add DS records instead."}
        </p>
      )}
    </fieldset>
  );
}
