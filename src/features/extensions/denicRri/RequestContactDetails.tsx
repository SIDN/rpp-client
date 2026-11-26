import { DefinitionList, DefinitionRow } from "@/components/common/definition";
import { t } from "@/i18n";
import type { RequestContact } from "@/rpp/extensions/modules/denicRri";
import { JsonView, OtherMembers, Provisioning } from "@/features/shared/objectParts";
import { TemplatePreview } from "./UriTemplateField";

const MODELLED = new Set(["@type", "id", "provMetadata", "uriTemplate"]);

/** Everything the server showed of a request contact; members this client does not model follow, as received. */
export function RequestContactDetails({ contact }: { contact: RequestContact }) {
  const others = Object.entries(contact).filter(([key]) => !MODELLED.has(key));
  const template = typeof contact.uriTemplate === "string" ? contact.uriTemplate : undefined;
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xl">
        <code>{contact.id}</code>
      </h3>
      <DefinitionList>
        <DefinitionRow term={t("requestContacts.template.label")}>
          {template === undefined ? <code>{JSON.stringify(contact.uriTemplate)}</code> : <code className="break-all">{template}</code>}
        </DefinitionRow>
        {template !== undefined && (
          <DefinitionRow term={t("requestContacts.preview.title")}>
            <TemplatePreview template={template} />
          </DefinitionRow>
        )}
        {contact.provMetadata && (
          <DefinitionRow term={t("domains.domainDetails.provisioning")}>
            <Provisioning metadata={contact.provMetadata} />
          </DefinitionRow>
        )}
        {others.length > 0 && (
          <DefinitionRow term={t("domains.domainDetails.otherMembers")}>
            <OtherMembers members={others} />
          </DefinitionRow>
        )}
      </DefinitionList>
      <JsonView label={t("requestContacts.details.asReceived")} value={contact} />
    </div>
  );
}
