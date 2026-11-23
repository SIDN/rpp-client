import { addressRecordsOf, ipVersionOf } from "@/application/hosts/hostData";
import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { StatusLabel } from "@/components/protocol/protocol-badges";
import type { Host } from "@/rpp/core/types/objects";
import { Provisioning, Timestamp } from "../shared/objectParts";

const MODELLED = new Set(["@type", "hostName", "provMetadata", "status", "dns", "processes"]);

function Addresses({ label, addresses }: { label: string; addresses: readonly string[] }) {
  if (addresses.length === 0) return <Nothing>No {label} address</Nothing>;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {addresses.map((address) => (
        <li key={address}>
          <code>{address}</code>
        </li>
      ))}
    </ul>
  );
}

/** Everything the server showed of a host, in the order a registrar looks for it; members this client does not model follow, as received. */
export function HostDetails({ host }: { host: Host }) {
  const records = host.dns?.records ?? [];
  const addresses = addressRecordsOf(host).map((record) => record.address);
  const processes = host.processes ? Object.entries(host.processes).filter(([key]) => key !== "@type") : [];
  const others = Object.entries(host).filter(([key]) => !MODELLED.has(key));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-xl">
          <code>{host.hostName}</code>
        </h3>
        <ul aria-label="Status" className="flex flex-wrap gap-2">
          {host.status.length === 0 && <li className="text-muted-foreground">No status listed</li>}
          {host.status.map((status, index) => (
            <li key={`${status.label}-${index}`} className="flex flex-col gap-0.5">
              <StatusLabel type="hostStatus" label={status.label} />
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
        <DefinitionRow term="IPv4 addresses">
          <Addresses label="IPv4" addresses={addresses.filter((address) => ipVersionOf(address) === 4)} />
        </DefinitionRow>
        <DefinitionRow term="IPv6 addresses">
          <Addresses label="IPv6" addresses={addresses.filter((address) => ipVersionOf(address) === 6)} />
        </DefinitionRow>
        <DefinitionRow term="DNS data">
          {records.length === 0 && !host.dns?.controls ? (
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
              {host.dns?.controls && <code className="break-all text-xs">{JSON.stringify(host.dns.controls)}</code>}
            </div>
          )}
        </DefinitionRow>
        <DefinitionRow term="Provisioning">
          <Provisioning metadata={host.provMetadata} />
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
              {others.map(([key, member]) => (
                <div key={key}>
                  <dt><code>{key}</code></dt>
                  <dd><code className="break-all text-xs">{JSON.stringify(member)}</code></dd>
                </div>
              ))}
            </dl>
          </DefinitionRow>
        )}
      </DefinitionList>

      <details className="rounded-md border border-border">
        <summary className="cursor-pointer px-3 py-2 font-medium">Show the JSON</summary>
        <pre tabIndex={0} aria-label="Host as received" className="max-h-[28rem] overflow-auto border-t border-border p-3 font-mono text-xs">
          {JSON.stringify(host, null, 2)}
        </pre>
      </details>
    </div>
  );
}
