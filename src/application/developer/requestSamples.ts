import type { HttpMethod } from "@/rpp/client/request";

/** A request the RPP API has, with example values to edit before sending. The samples are starting points, not validated for any server. */
export interface RequestSample {
  id: string;
  group: string;
  label: string;
  method: HttpMethod;
  target: string;
  /** One `name=value` per line, as the form takes it. */
  query?: string;
  /** One `Name: value` per line, as the form takes it. */
  headers?: string;
  body?: unknown;
}

const DOMAIN = "domainNames/example.nl";
const CONTACT = "contacts/C-1";
const HOST = "hosts/ns1.example.nl";
const ORGANISATION = "organisations/ORG-1";

const card = {
  "@type": "Card",
  version: "2.0",
  name: { full: "Jan Jansen" },
  organizations: { org: { name: "Voorbeeld BV" } },
  addresses: { addr: { components: [{ kind: "name", value: "Hoofdstraat 1" }, { kind: "locality", value: "Arnhem" }, { kind: "postcode", value: "6811 AA" }], countryCode: "NL" } },
  phones: { voice: { number: "tel:+31.261234567" } },
  emails: { email: { address: "jan@example.nl" } },
};

const process = (owner: string, segment: string) => `${owner}/processes/${segment}`;
const authorization = "RPP-Authorization: authinfo value=c2VjcmV0";

const restoreReport = {
  "@type": "restoreReport",
  preData: "The registration data as it was before the domain was deleted.",
  postData: "The registration data as it is after the restore.",
  deleteTime: "2026-01-02T03:04:05Z",
  restoreTime: "2026-01-09T03:04:05Z",
  restoreReason: "The registrant asked for it.",
  statements: [
    "This registrar has not restored the domain name to rectify a violation of registry policy.",
    "The information in this report is true to the best of this registrar's knowledge.",
  ],
};

export const REQUEST_SAMPLES: readonly RequestSample[] = [
  { id: "domain-availability", group: "Domain names", label: "Check availability", method: "GET", target: `${DOMAIN}/availability` },
  { id: "domain-read", group: "Domain names", label: "Read", method: "GET", target: DOMAIN, query: "hostsFilter=all" },
  {
    id: "domain-create",
    group: "Domain names",
    label: "Register",
    method: "POST",
    target: "domainNames",
    body: {
      "@type": "domainName",
      name: "example.nl",
      registrant: { "@type": "contact", id: "C-1" },
      contacts: [{ label: "tech", object: { "@type": "contact", id: "C-2" } }],
      nameservers: [{ "@type": "host", hostName: "ns1.example.nl" }],
      authInfo: { "@type": "authInfo", method: "authinfo", authdata: "secret" },
      processes: { "@type": "processes", createProcess: [{ "@type": "domainCreateProcess", period: { "@type": "period", value: 1, unit: "y" } }] },
    },
  },
  {
    id: "domain-replace",
    group: "Domain names",
    label: "Replace (full update)",
    method: "PUT",
    target: DOMAIN,
    body: {
      "@type": "domainName",
      registrant: { "@type": "contact", id: "C-1" },
      contacts: [{ label: "tech", object: { "@type": "contact", id: "C-2" } }],
      nameservers: [{ "@type": "host", hostName: "ns1.example.nl" }],
    },
  },
  {
    id: "domain-patch",
    group: "Domain names",
    label: "Change (JSON Patch)",
    method: "PATCH",
    target: DOMAIN,
    body: [
      { op: "add", path: "/nameservers", value: { "@type": "host", hostName: "ns2.example.nl" } },
      { op: "remove", path: "/nameservers", match: { hostName: "ns1.example.nl" } },
      { op: "add", path: "/status", value: { "@type": "domainStatus", label: "clientTransferProhibited" } },
    ],
  },
  {
    id: "domain-patch-dnssec",
    group: "Domain names",
    label: "Change DNSSEC (JSON Patch)",
    method: "PATCH",
    target: DOMAIN,
    body: [
      { op: "add", path: "/dns/records", value: { "@type": "dnsRecord", name: "@", type: "ds", rdata: { keyTag: "12345", algorithm: "13", digestType: "2", digest: "49FD46E6C4B45C55D4AC" } } },
      { op: "replace", path: "/dns/controls", value: { "@type": "dnsControls", maxSigLifetime: { ds: 604800 } } },
    ],
  },
  { id: "domain-delete", group: "Domain names", label: "Delete", method: "DELETE", target: DOMAIN },
  { id: "domain-processes", group: "Domain names", label: "List processes", method: "GET", target: `${DOMAIN}/processes` },
  {
    id: "domain-renew",
    group: "Domain names",
    label: "Renew",
    method: "POST",
    target: process(DOMAIN, "renewProcesses"),
    body: { "@type": "renewProcess", expiryDate: "2027-01-02T03:04:05Z", renewalPeriod: { "@type": "period", value: 1, unit: "y" } },
  },
  { id: "domain-restore-list", group: "Domain names", label: "List restore processes", method: "GET", target: process(DOMAIN, "restoreProcesses") },
  {
    id: "domain-restore-request",
    group: "Domain names",
    label: "Request a restore",
    method: "POST",
    target: process(DOMAIN, "restoreProcesses"),
    body: { "@type": "restoreProcess" },
  },
  { id: "domain-restore-read", group: "Domain names", label: "Read the latest restore", method: "GET", target: process(DOMAIN, "restoreProcesses/latest") },
  {
    id: "domain-restore-report",
    group: "Domain names",
    label: "Send a restore report",
    method: "PUT",
    target: process(DOMAIN, "restoreProcesses/latest"),
    body: { "@type": "restoreProcess", restoreReport },
  },
  { id: "domain-transfer-list", group: "Domain names", label: "List transfers", method: "GET", target: process(DOMAIN, "transferProcesses") },
  {
    id: "domain-transfer-request",
    group: "Domain names",
    label: "Request a transfer",
    method: "POST",
    target: process(DOMAIN, "transferProcesses"),
    headers: authorization,
    body: { "@type": "domainTransferProcess", transferPeriod: { "@type": "period", value: 1, unit: "y" } },
  },
  { id: "domain-transfer-read", group: "Domain names", label: "Read the latest transfer", method: "GET", target: process(DOMAIN, "transferProcesses/latest") },
  { id: "domain-transfer-cancel", group: "Domain names", label: "Cancel a transfer", method: "DELETE", target: process(DOMAIN, "transferProcesses/latest") },
  { id: "domain-transfer-approve", group: "Domain names", label: "Approve a transfer", method: "POST", target: process(DOMAIN, "transferProcesses/latest/transferApprove") },
  { id: "domain-transfer-reject", group: "Domain names", label: "Reject a transfer", method: "POST", target: process(DOMAIN, "transferProcesses/latest/transferReject") },

  { id: "contact-availability", group: "Contacts", label: "Check availability", method: "GET", target: `${CONTACT}/availability` },
  { id: "contact-read", group: "Contacts", label: "Read", method: "GET", target: CONTACT },
  { id: "contact-create", group: "Contacts", label: "Create", method: "POST", target: "contacts", body: { "@type": "contact", id: "C-1", contactInfo: card } },
  { id: "contact-replace", group: "Contacts", label: "Replace (full update)", method: "PUT", target: CONTACT, body: { "@type": "contact", contactInfo: card } },
  {
    id: "contact-patch",
    group: "Contacts",
    label: "Change (JSON Patch)",
    method: "PATCH",
    target: CONTACT,
    body: [{ op: "replace", path: "/contactInfo/emails/email/address", value: "jan.jansen@example.nl" }],
  },
  { id: "contact-delete", group: "Contacts", label: "Delete", method: "DELETE", target: CONTACT },
  { id: "contact-transfer-request", group: "Contacts", label: "Request a transfer", method: "POST", target: process(CONTACT, "transferProcesses"), headers: authorization, body: { "@type": "transferProcess", transferDir: "pull" } },
  { id: "contact-transfer-read", group: "Contacts", label: "Read the latest transfer", method: "GET", target: process(CONTACT, "transferProcesses/latest") },
  { id: "contact-transfer-approve", group: "Contacts", label: "Approve a transfer", method: "POST", target: process(CONTACT, "transferProcesses/latest/transferApprove") },
  { id: "contact-transfer-reject", group: "Contacts", label: "Reject a transfer", method: "POST", target: process(CONTACT, "transferProcesses/latest/transferReject") },

  { id: "host-availability", group: "Hosts", label: "Check availability", method: "GET", target: `${HOST}/availability` },
  { id: "host-read", group: "Hosts", label: "Read", method: "GET", target: HOST },
  {
    id: "host-create",
    group: "Hosts",
    label: "Create",
    method: "POST",
    target: "hosts",
    body: {
      "@type": "host",
      hostName: "ns1.example.nl",
      dns: {
        "@type": "dnsData",
        records: [
          { "@type": "dnsRecord", name: "@", type: "ns", rdata: { nsdname: "ns1.example.nl." } },
          { "@type": "dnsRecord", name: "ns1.example.nl.", type: "a", rdata: { address: "192.0.2.1" } },
        ],
      },
    },
  },
  {
    id: "host-patch",
    group: "Hosts",
    label: "Change (JSON Patch)",
    method: "PATCH",
    target: HOST,
    body: [{ op: "add", path: "/dns/records", value: { "@type": "dnsRecord", name: "ns1.example.nl.", type: "aaaa", rdata: { address: "2001:db8::1" } } }],
  },
  { id: "host-delete", group: "Hosts", label: "Delete", method: "DELETE", target: HOST },

  { id: "organisation-read", group: "Organisations", label: "Read", method: "GET", target: ORGANISATION },
  {
    id: "organisation-create",
    group: "Organisations",
    label: "Create",
    method: "POST",
    target: "organisations",
    body: { "@type": "organisation", id: "ORG-1", roles: { registrar: { "@type": "organisationRole", roleId: "REG-1" } }, contactInfo: card },
  },
  {
    id: "organisation-patch",
    group: "Organisations",
    label: "Change (JSON Patch)",
    method: "PATCH",
    target: ORGANISATION,
    body: [{ op: "add", path: "/status", value: { "@type": "organisationStatus", label: "clientLinkProhibited" } }],
  },
  { id: "organisation-delete", group: "Organisations", label: "Delete", method: "DELETE", target: ORGANISATION },
  { id: "user-read", group: "Organisations", label: "Read a user", method: "GET", target: `${ORGANISATION}/users/U-1` },
  {
    id: "user-create",
    group: "Organisations",
    label: "Create a user",
    method: "POST",
    target: `${ORGANISATION}/users`,
    body: { "@type": "user", id: "U-1", details: card, description: "Registrar staff" },
  },
  {
    id: "user-patch",
    group: "Organisations",
    label: "Change a user (JSON Patch)",
    method: "PATCH",
    target: `${ORGANISATION}/users/U-1`,
    body: [{ op: "replace", path: "/status", value: { "@type": "userStatus", label: "suspended" } }],
  },
  { id: "user-delete", group: "Organisations", label: "Delete a user", method: "DELETE", target: `${ORGANISATION}/users/U-1` },

  { id: "message-query", group: "Messages", label: "Query", method: "GET", target: "messages", query: "type=domainTransfer" },
  { id: "message-read", group: "Messages", label: "Read", method: "GET", target: "messages/M-1" },
  { id: "message-acknowledge", group: "Messages", label: "Acknowledge", method: "DELETE", target: "messages/M-1" },
];
