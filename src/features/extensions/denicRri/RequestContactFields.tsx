import { useFormContext } from "react-hook-form";
import { Field, Input } from "@/components/ui/field";
import { t } from "@/i18n";
import { DENIC_RRI } from "@/rpp/extensions/modules/denicRri";
import { ExtensionBadge } from "./ExtensionBadge";
import type { RequestContactValues } from "./formValues";


/**
 * The General Request and Abuse contacts of a domain (DENIC RRI extension, §Domain Name Data Object): each the handle
 * of a request contact of this client, or empty for none.
 */
export function RequestContactFields({ legend, badge = true }: { legend?: string; badge?: boolean }) {
  const { register } = useFormContext<RequestContactValues>();
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>{legend ?? t("rri.domain.legend")}</span>
        {badge && <ExtensionBadge module={DENIC_RRI} />}
      </legend>
      <Field label={t("rri.domain.generalRequest")} hint={t("rri.domain.generalRequestHint")}>
        {(control) => <Input {...control} spellCheck={false} autoComplete="off" className="max-w-64 font-mono" {...register("generalRequest")} />}
      </Field>
      <Field label={t("rri.domain.abuse")} hint={t("rri.domain.abuseHint")}>
        {(control) => <Input {...control} spellCheck={false} autoComplete="off" className="max-w-64 font-mono" {...register("abuse")} />}
      </Field>
    </fieldset>
  );
}
