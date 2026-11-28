import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input, type FieldControlProps } from "@/components/ui/field";
import { t } from "@/i18n";
import { generateTransferCode } from "@/lib/transferCode";

/** A field for a new transfer code, with a button that fills in a random one and shows it so it can be copied. */
export function TransferCodeInput({ name, control }: { name: string; control: FieldControlProps }) {
  const { register, setValue } = useFormContext();
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input {...control} type={shown ? "text" : "password"} autoComplete="off" spellCheck={false} className="max-w-64 font-mono" {...register(name)} />
      <Button size="sm" variant="secondary" onClick={() => { setValue(name, generateTransferCode(), { shouldDirty: true }); setShown(true); }}>
        {t("shared.transferCode.generate")}
      </Button>
      <Button size="sm" variant="ghost" aria-pressed={shown} onClick={() => setShown((current) => !current)}>
        {shown ? t("shared.transferCode.hide") : t("shared.transferCode.show")}
      </Button>
    </div>
  );
}
