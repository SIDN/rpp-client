import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Field, Input } from "@/components/ui/field";
import { t } from "@/i18n";
import { tryParseDomainName } from "@/application/domains/domainWorkflows";
import { uriTemplateProblems } from "@/application/extensions/denicRri/requestContactWorkflows";
import { expandUriTemplate } from "@/rpp/extensions/modules/denicRri";

export interface UriTemplateValues {
  uriTemplate: string;
}

/** What a template comes to for one domain name; nothing while the name cannot be read. */
export function TemplatePreview({ template }: { template: string }) {
  const [domain, setDomain] = useState("");
  const ref = tryParseDomainName(domain);
  return (
    <div className="flex flex-col gap-2">
      <Field label={t("requestContacts.preview.domain")} hint={t("requestContacts.preview.hint")}>
        {(control) => (
          <Input
            {...control}
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="max-w-80 font-mono"
          />
        )}
      </Field>
      {ref && template !== "" && (
        <p className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("requestContacts.preview.result")}</span>
          <code className="break-all">{expandUriTemplate(template, { Alabel: ref.name, Ulabel: ref.unicode ?? ref.name })}</code>
        </p>
      )}
    </div>
  );
}

/**
 * The URI Template, checked as it is typed against the constraints of the extension. The check only advises: the value
 * is sent as typed, and the server and the registry decide.
 */
export function UriTemplateField() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<UriTemplateValues>();
  const template = useWatch({ control, name: "uriTemplate" }) ?? "";
  const problems = template === "" ? [] : uriTemplateProblems(template);
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("requestContacts.template.label")} hint={t("requestContacts.template.hint")} error={errors.uriTemplate?.message}>
        {(controlProps) => (
          <Input
            {...controlProps}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://www.example.com/contact?domain={Alabel}"
            className="font-mono"
            {...register("uriTemplate", { validate: (value) => value.trim() !== "" || t("requestContacts.template.required") })}
          />
        )}
      </Field>
      {problems.length > 0 && (
        <div role="status" className="flex flex-col gap-1 rounded-md border-l-4 border-warning bg-warning-soft px-4 py-3 text-sm">
          <p className="font-medium text-warning-ink">{t("requestContacts.template.clientCheck")}</p>
          <ul className="list-disc pl-5">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      <TemplatePreview template={template} />
    </div>
  );
}
