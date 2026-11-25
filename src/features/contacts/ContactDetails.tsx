import { dataOf, hasAddress, localizedAddressesOf, postalModeOfContact, type AddressData } from "@/application/contacts/contactCard";
import { DefinitionList, DefinitionRow, Nothing } from "@/components/common/definition";
import { StatusLabel } from "@/components/protocol/protocol-badges";
import type { Contact } from "@/rpp/core/types/objects";
import { Provisioning, Secret, Timestamp } from "../shared/objectParts";

const MODELLED = new Set(["@type", "id", "provMetadata", "status", "contactInfo", "disclose", "authInfo", "processes"]);

function Address({ address }: { address: AddressData }) {
  if (!hasAddress(address)) return <Nothing>Not given</Nothing>;
  return (
    <address className="not-italic">
      {address.street.filter(Boolean).map((line) => (
        <div key={line}>{line}</div>
      ))}
      <div>{[address.postcode, address.city].filter(Boolean).join(" ")}</div>
      {address.region && <div>{address.region}</div>}
      {address.country && <div>{address.country}</div>}
    </address>
  );
}

const value = (text: string) => (text === "" ? <Nothing>Not given</Nothing> : text);

/** Everything the server showed of a contact; the Card members this view does not read, and other members, follow as received. */
export function ContactDetails({ contact }: { contact: Contact }) {
  const mode = postalModeOfContact(contact);
  const data = dataOf(contact, mode);
  const card = contact.contactInfo;
  const processes = contact.processes ? Object.entries(contact.processes).filter(([key]) => key !== "@type") : [];
  const others = Object.entries(contact).filter(([key]) => !MODELLED.has(key));
  const authInfo = contact.authInfo;
  const localized = localizedAddressesOf(contact);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="flex flex-wrap items-baseline gap-x-3 text-xl">
          <code>{contact.id}</code>
          {data.name && <span className="font-normal">{data.name}</span>}
        </h3>
        <ul aria-label="Status" className="flex flex-wrap gap-2">
          {contact.status.length === 0 && <li className="text-muted-foreground">No status listed</li>}
          {contact.status.map((status, index) => (
            <li key={`${status.label}-${index}`} className="flex flex-col gap-0.5">
              <StatusLabel type="contactStatus" label={status.label} />
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
        <DefinitionRow term="Kind">{data.kind === "" ? <Nothing>Not given</Nothing> : data.kind === "org" ? "Organisation" : "Individual"}</DefinitionRow>
        <DefinitionRow term="Name">{value(data.name)}</DefinitionRow>
        <DefinitionRow term="Organisation">{value(data.organisation)}</DefinitionRow>
        {mode === "both" && (
          <DefinitionRow term="Address (int)">
            <Address address={data.address} />
          </DefinitionRow>
        )}
        <DefinitionRow term={mode === "both" ? "Address (loc)" : "Address"}>
          {localized.length === 0 ? (
            <Nothing>Not given</Nothing>
          ) : (
            <ul className="flex flex-col gap-3">
              {localized.map(({ localization, key, address }) => (
                <li key={`${localization}/${key}`} className="flex flex-col gap-1">
                  <code className="text-xs text-muted-foreground">{localization}</code>
                  <Address address={address} />
                </li>
              ))}
            </ul>
          )}
        </DefinitionRow>
        <DefinitionRow term="Phone">{data.voice ? <code>{data.voice}</code> : <Nothing>Not given</Nothing>}</DefinitionRow>
        <DefinitionRow term="Fax">{data.fax ? <code>{data.fax}</code> : <Nothing>Not given</Nothing>}</DefinitionRow>
        <DefinitionRow term="Email">{value(data.email)}</DefinitionRow>
        {contact.disclose !== undefined && (
          <DefinitionRow term="Disclosure">
            <code className="break-all text-xs">{JSON.stringify(contact.disclose)}</code>
          </DefinitionRow>
        )}
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
          <Provisioning metadata={contact.provMetadata} />
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
        <pre tabIndex={0} aria-label="Contact as received" className="max-h-[28rem] overflow-auto border-t border-border p-3 font-mono text-xs">
          {JSON.stringify(authInfo ? { ...contact, authInfo: { ...authInfo, authdata: "[hidden: use Show above]" } } : contact, null, 2)}
        </pre>
      </details>
    </div>
  );
}
