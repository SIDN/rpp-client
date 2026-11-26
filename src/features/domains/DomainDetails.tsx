import { t } from "@/i18n";
import { Link } from "react-router-dom";
import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { StatusLabel } from "@/components/protocol/protocol-badges";
import { Badge } from "@/components/ui/badge";
import type { DomainName } from "@/rpp/core/types/objects";
import { Provisioning, Secret, Timestamp } from "../shared/objectParts";

const MODELLED = new Set([
  "@type", "name", "uName", "lgr", "provMetadata", "status", "registrant", "contacts", "nameservers", "dns",
  "subordinateHosts", "expiryDate", "authInfo", "processes",
]);

/** The contact, looked up on the Contacts screen as soon as it opens. */
function ContactLink({ id }: { id: string }) {
  const query = new URLSearchParams({ tab: "info", name: id, run: "1" });
  return (
    <Link to={`/contacts?${query}`} className="underline underline-offset-2">
      <code>{id}</code>
    </Link>
  );
}

/** The host, looked up on the Hosts screen as soon as it opens. */
function HostLink({ name }: { name: string }) {
  const query = new URLSearchParams({ tab: "info", name, run: "1" });
  return (
    <Link to={`/hosts?${query}`} className="underline underline-offset-2">
      <code>{name}</code>
    </Link>
  );
}

function List({ items }: { items: readonly string[] | undefined }) {
  if (!items || items.length === 0) return <Nothing />;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item}>
          <HostLink name={item} />
        </li>
      ))}
    </ul>
  );
}

/** Everything the server showed of a domain, in the order a registrar looks for it; members this client does not model follow, as received. */
export function DomainDetails({ domain }: { domain: DomainName }) {
  const records = domain.dns?.records ?? [];
  const processes = domain.processes ? Object.entries(domain.processes).filter(([key]) => key !== "@type") : [];
  const others = Object.entries(domain).filter(([key]) => !MODELLED.has(key));
  const authInfo = domain.authInfo;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="flex flex-wrap items-baseline gap-x-3 text-xl">
          <code>{domain.name}</code>
          {domain.uName && <span className="font-normal">{domain.uName}</span>}
        </h3>
        <ul aria-label={t("domains.domainDetails.status")} className="flex flex-wrap gap-2">
          {domain.status.length === 0 && <li className="text-muted-foreground">{t("domains.domainDetails.noStatus")}</li>}
          {domain.status.map((status, index) => (
            <li key={`${status.label}-${index}`} className="flex flex-col gap-0.5">
              <StatusLabel type="domainStatus" label={status.label} />
              {(status.reason || status.due) && (
                <span className="text-xs text-muted-foreground">
                  {status.reason}
                  {status.reason && status.due ? ", " : ""}
                  {status.due && <>{t("domains.domainDetails.due")} <Timestamp value={status.due} /></>}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <DefinitionList>
        <DefinitionRow term={t("domains.domainDetails.expires")}>
          <Timestamp value={domain.expiryDate} />
        </DefinitionRow>
        <DefinitionRow term={t("domains.domainDetails.registrant")}>{domain.registrant ? <ContactLink id={domain.registrant.id} /> : <Nothing />}</DefinitionRow>
        <DefinitionRow term={t("domains.domainDetails.contacts")}>
          {domain.contacts && domain.contacts.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {domain.contacts.map((contact, index) => (
                <li key={`${contact.label}-${contact.object.id}-${index}`} className="flex flex-wrap items-center gap-2">
                  <Badge>{contact.label}</Badge>
                  <ContactLink id={contact.object.id} />
                </li>
              ))}
            </ul>
          ) : (
            <Nothing />
          )}
        </DefinitionRow>
        <DefinitionRow term={t("domains.nameservers.label")}>
          <List items={domain.nameservers?.map((host) => host.hostName)} />
        </DefinitionRow>
        <DefinitionRow term={t("domains.domainDetails.subordinateHosts")}>
          <List items={domain.subordinateHosts?.map((host) => host.hostName)} />
        </DefinitionRow>
        <DefinitionRow term={t("domains.domainDetails.dnsData")}>
          {records.length === 0 && !domain.dns?.controls ? (
            <Nothing />
          ) : (
            <div className="flex flex-col gap-2">
              {records.length > 0 && (
                <table className="w-full table-fixed text-sm">
                  <caption className="sr-only">{t("domains.domainDetails.dnsRecords")}</caption>
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th scope="col" className="w-1/4 pr-3 font-medium">{t("domains.domainDetails.name")}</th>
                      <th scope="col" className="w-16 pr-3 font-medium">{t("domains.domainDetails.type")}</th>
                      <th scope="col" className="font-medium">{t("domains.domainDetails.data")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {records.map((record, index) => (
                      <tr key={index} className="align-top">
                        <td className="break-all py-1 pr-3"><code>{record.name}</code></td>
                        <td className="py-1 pr-3"><code>{record.type}</code></td>
                        <td className="break-all py-1"><code>{JSON.stringify(record.rdata)}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {domain.dns?.controls && <code className="break-all text-xs">{JSON.stringify(domain.dns.controls)}</code>}
            </div>
          )}
        </DefinitionRow>
        <DefinitionRow term={t("domains.domainDetails.transferPassword")}>
          {authInfo ? (
            <span className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">{t("domains.domainDetails.method")} <code>{authInfo.method}</code></span>
              <Secret value={authInfo.authdata} />
            </span>
          ) : (
            <Nothing>{t("domains.domainDetails.notShown")}</Nothing>
          )}
        </DefinitionRow>
        <DefinitionRow term={t("domains.domainDetails.provisioning")}>
          <Provisioning metadata={domain.provMetadata} />
        </DefinitionRow>
        <DefinitionRow term={t("domains.domainDetails.processes")}>
          {processes.length === 0 ? (
            <Nothing />
          ) : (
            <ul className="flex flex-col gap-1">
              {processes.map(([kind, list]) => (
                <li key={kind}>
                  <code>{kind}</code>{" "}
                  {Array.isArray(list) ? list.map((entry: { processId?: string }) => entry.processId).filter(Boolean).join(", ") : ""}
                </li>
              ))}
            </ul>
          )}
        </DefinitionRow>
        {others.length > 0 && (
          <DefinitionRow term={t("domains.domainDetails.otherMembers")}>
            <dl className="flex flex-col gap-2">
              {others.map(([key, value]) => (
                <div key={key}>
                  <dt><code>{key}</code></dt>
                  <dd><code className="break-all text-xs">{JSON.stringify(value)}</code></dd>
                </div>
              ))}
            </dl>
          </DefinitionRow>
        )}
      </DefinitionList>

      <details className="rounded-md border border-border">
        <summary className="cursor-pointer px-3 py-2 font-medium">{t("domains.domainDetails.showJson")}</summary>
        <pre tabIndex={0} aria-label={t("domains.domainDetails.asReceived")} className="max-h-[28rem] overflow-auto border-t border-border p-3 font-mono text-xs">
          {JSON.stringify(authInfo ? { ...domain, authInfo: { ...authInfo, authdata: "[hidden: use Show above]" } } : domain, null, 2)}
        </pre>
      </details>
    </div>
  );
}
