import { DefinitionRow, Nothing } from "@/components/common/definition";
import { t } from "@/i18n";
import { requestContactOf } from "@/application/extensions/denicRri/rriDomain";
import type { DomainName } from "@/rpp/core/types/objects";
import { RequestContactLink } from "./links";

/** The request contacts of a domain, as rows of its details. A value that is not a reference stays with the other members. */
export function RriDomainRows({ domain }: { domain: DomainName }) {
  const generalRequest = requestContactOf(domain, "generalRequest");
  const abuse = requestContactOf(domain, "abuse");
  return (
    <>
      <DefinitionRow term={t("rri.domain.generalRequest")}>{generalRequest ? <RequestContactLink id={generalRequest} /> : <Nothing />}</DefinitionRow>
      <DefinitionRow term={t("rri.domain.abuse")}>{abuse ? <RequestContactLink id={abuse} /> : <Nothing />}</DefinitionRow>
    </>
  );
}
