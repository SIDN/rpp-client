import { Plus, X } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { t } from "@/i18n";
import { DENIC_RRI } from "@/rpp/extensions/modules/denicRri";
import { ContactLookup } from "@/features/shared/ContactLookup";
import { ExtensionBadge } from "./ExtensionBadge";
import { DnsRecordFields } from "@/features/domains/DnsRecordFields";
import { DnssecFields } from "@/features/domains/DnssecFields";
import { RequestContactFields } from "./RequestContactFields";
import type { RriTransferValues } from "./formValues";

function HolderFields() {
  const { control, register } = useFormContext<RriTransferValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "rriHolders" });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{t("rri.transfer.holders")}</legend>
      {fields.length === 0 && <p className="text-sm text-muted-foreground">{t("rri.transfer.noHolders")}</p>}
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-center gap-2">
          <Input aria-label={t("rri.transfer.holderAria", { number: index + 1 })} spellCheck={false} className="max-w-64 font-mono" {...register(`rriHolders.${index}.id`)} />
          <Button variant="ghost" size="icon" aria-label={t("rri.transfer.removeHolder", { number: index + 1 })} onClick={() => remove(index)}>
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" onClick={() => append({ id: "" })}>
          <Plus aria-hidden />
          {t("rri.transfer.addHolder")}
        </Button>
      </div>
    </fieldset>
  );
}

/**
 * The domain as this client holds it after the transfer, which DENIC RRI requires with the request (§Create (Transfer
 * Request)): the holders, the request contacts and the DNS data.
 */
export function RriTransferFields({ domain }: { domain: string }) {
  const {
    register,
    setValue,
    formState: { errors },
  } = useFormContext<RriTransferValues>();
  return (
    <section aria-label={t("rri.transfer.sectionLabel")} className="flex flex-col gap-5">
      <h4 className="flex flex-wrap items-center gap-2 font-semibold">
        <span>{t("rri.transfer.sectionLabel")}</span>
        <ExtensionBadge module={DENIC_RRI} />
      </h4>
      <p className="text-sm text-muted-foreground">{t("rri.transfer.explanation")}</p>
      <Field label={t("domains.contacts.registrant")} hint={t("rri.transfer.registrantHint")} error={errors.rriRegistrant?.message}>
        {(control) => (
          <div className="flex flex-wrap items-center gap-2">
            <Input {...control} spellCheck={false} className="max-w-64 font-mono" {...register("rriRegistrant")} />
            <ContactLookup label={t("domains.contacts.lookupRegistrant")} onSelect={(id) => setValue("rriRegistrant", id, { shouldDirty: true })} />
          </div>
        )}
      </Field>
      <HolderFields />
      <RequestContactFields badge={false} />
      <DnsRecordFields domain={domain} />
      <DnssecFields kinds={["dnskey"]} controls={false} />
    </section>
  );
}
