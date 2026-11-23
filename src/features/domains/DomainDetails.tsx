import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { StatusLabel } from "@/components/protocol/protocol-badges";
import { Badge } from "@/components/ui/badge";
import type { DomainName } from "@/rpp/core/types/objects";
import { Provisioning, Secret, Timestamp } from "../shared/objectParts";

const MODELLED = new Set([
  "@type", "name", "uName", "lgr", "provMetadata", "status", "registrant", "contacts", "nameservers", "dns",
  "subordinateHosts", "expiryDate", "authInfo", "processes",
]);

function List({ items }: { items: readonly string[] | undefined }) {
  if (!items || items.length === 0) return <Nothing />;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item}>
          <code>{item}</code>
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
        <ul aria-label="Status" className="flex flex-wrap gap-2">
          {domain.status.length === 0 && <li className="text-muted-foreground">No status listed</li>}
          {domain.status.map((status, index) => (
            <li key={`${status.label}-${index}`} className="flex flex-col gap-0.5">
              <StatusLabel type="domainStatus" label={status.label} />
              {(status.reason || status.due) && (
                <span className="text-xs text-muted-foreground">
                  {status.reason}
                  {status.reason && status.due ? ", " : ""}
                  {status.due && <>due <Timestamp value={status.due} /></>}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <DefinitionList>
        <DefinitionRow term="Expires">
          <Timestamp value={domain.expiryDate} />
        </DefinitionRow>
        <DefinitionRow term="Registrant">{domain.registrant ? <code>{domain.registrant.id}</code> : <Nothing />}</DefinitionRow>
        <DefinitionRow term="Contacts">
          {domain.contacts && domain.contacts.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {domain.contacts.map((contact, index) => (
                <li key={`${contact.label}-${contact.object.id}-${index}`} className="flex flex-wrap items-center gap-2">
                  <Badge>{contact.label}</Badge>
                  <code>{contact.object.id}</code>
                </li>
              ))}
            </ul>
          ) : (
            <Nothing />
          )}
        </DefinitionRow>
        <DefinitionRow term="Name servers">
          <List items={domain.nameservers?.map((host) => host.hostName)} />
        </DefinitionRow>
        <DefinitionRow term="Subordinate hosts">
          <List items={domain.subordinateHosts?.map((host) => host.hostName)} />
        </DefinitionRow>
        <DefinitionRow term="DNS data">
          {records.length === 0 && !domain.dns?.controls ? (
            <Nothing />
          ) : (
            <div className="flex flex-col gap-2">
              {records.length > 0 && (
                <table className="w-full table-fixed text-sm">
                  <caption className="sr-only">DNS records</caption>
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th scope="col" className="w-1/4 pr-3 font-medium">Name</th>
                      <th scope="col" className="w-16 pr-3 font-medium">Type</th>
                      <th scope="col" className="font-medium">Data</th>
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
        <DefinitionRow term="Transfer password">
          {authInfo ? (
            <span className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Method <code>{authInfo.method}</code></span>
              <Secret value={authInfo.authdata} />
            </span>
          ) : (
            <Nothing>Not shown. Get the info with the transfer password included, as the sponsoring registrar, to see it.</Nothing>
          )}
        </DefinitionRow>
        <DefinitionRow term="Provisioning">
          <Provisioning metadata={domain.provMetadata} />
        </DefinitionRow>
        <DefinitionRow term="Processes">
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
          <DefinitionRow term="Other members">
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
        <summary className="cursor-pointer px-3 py-2 font-medium">Show the JSON</summary>
        <pre tabIndex={0} aria-label="Domain as received" className="max-h-[28rem] overflow-auto border-t border-border p-3 font-mono text-xs">
          {JSON.stringify(authInfo ? { ...domain, authInfo: { ...authInfo, authdata: "[hidden: use Show above]" } } : domain, null, 2)}
        </pre>
      </details>
    </div>
  );
}
