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
  { id: "domain-availability", group: "developer.samples.group.domainNames", label: "developer.samples.label.checkAvailability", method: "GET", target: `${DOMAIN}/availability` },
  { id: "domain-read", group: "developer.samples.group.domainNames", label: "developer.samples.label.read", method: "GET", target: DOMAIN, query: "hostsFilter=all" },
  {
    id: "domain-create",
    group: "developer.samples.group.domainNames",
    label: "developer.samples.label.register",
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
    group: "developer.samples.group.domainNames",
    label: "developer.samples.label.replace",
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
    group: "developer.samples.group.domainNames",
    label: "developer.samples.label.change",
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
    group: "developer.samples.group.domainNames",
    label: "developer.samples.label.changeDnssec",
    method: "PATCH",
    target: DOMAIN,
    body: [
      { op: "add", path: "/dns/records", value: { "@type": "dnsRecord", name: "@", type: "ds", rdata: { keyTag: "12345", algorithm: "13", digestType: "2", digest: "49FD46E6C4B45C55D4AC" } } },
      { op: "replace", path: "/dns/controls", value: { "@type": "dnsControls", maxSigLifetime: { ds: 604800 } } },
    ],
  },
  { id: "domain-delete", group: "developer.samples.group.domainNames", label: "developer.samples.label.delete", method: "DELETE", target: DOMAIN },
  { id: "domain-processes", group: "developer.samples.group.domainNames", label: "developer.samples.label.listProcesses", method: "GET", target: `${DOMAIN}/processes` },
  {
    id: "domain-renew",
    group: "developer.samples.group.domainNames",
    label: "developer.samples.label.renew",
    method: "POST",
    target: process(DOMAIN, "renewProcesses"),
    body: { "@type": "renewProcess", expiryDate: "2027-01-02T03:04:05Z", renewalPeriod: { "@type": "period", value: 1, unit: "y" } },
  },
  { id: "domain-restore-list", group: "developer.samples.group.domainNames", label: "developer.samples.label.listRestoreProcesses", method: "GET", target: process(DOMAIN, "restoreProcesses") },
  {
    id: "domain-restore-request",
    group: "developer.samples.group.domainNames",
    label: "developer.samples.label.requestRestore",
    method: "POST",
    target: process(DOMAIN, "restoreProcesses"),
    body: { "@type": "restoreProcess" },
  },
  { id: "domain-restore-read", group: "developer.samples.group.domainNames", label: "developer.samples.label.readLatestRestore", method: "GET", target: process(DOMAIN, "restoreProcesses/latest") },
  {
    id: "domain-restore-report",
    group: "developer.samples.group.domainNames",
    label: "developer.samples.label.sendRestoreReport",
    method: "PUT",
    target: process(DOMAIN, "restoreProcesses/latest"),
    body: { "@type": "restoreProcess", restoreReport },
  },
  { id: "domain-transfer-list", group: "developer.samples.group.domainNames", label: "developer.samples.label.listTransfers", method: "GET", target: process(DOMAIN, "transferProcesses") },
  {
    id: "domain-transfer-request",
    group: "developer.samples.group.domainNames",
    label: "developer.samples.label.requestTransfer",
    method: "POST",
    target: process(DOMAIN, "transferProcesses"),
    headers: authorization,
    body: { "@type": "domainTransferProcess", transferPeriod: { "@type": "period", value: 1, unit: "y" } },
  },
  { id: "domain-transfer-read", group: "developer.samples.group.domainNames", label: "developer.samples.label.readLatestTransfer", method: "GET", target: process(DOMAIN, "transferProcesses/latest") },
  { id: "domain-transfer-cancel", group: "developer.samples.group.domainNames", label: "developer.samples.label.cancelTransfer", method: "DELETE", target: process(DOMAIN, "transferProcesses/latest") },
  { id: "domain-transfer-approve", group: "developer.samples.group.domainNames", label: "developer.samples.label.approveTransfer", method: "POST", target: process(DOMAIN, "transferProcesses/latest/transferApprove") },
  { id: "domain-transfer-reject", group: "developer.samples.group.domainNames", label: "developer.samples.label.rejectTransfer", method: "POST", target: process(DOMAIN, "transferProcesses/latest/transferReject") },

  { id: "contact-availability", group: "developer.samples.group.contacts", label: "developer.samples.label.checkAvailability", method: "GET", target: `${CONTACT}/availability` },
  { id: "contact-read", group: "developer.samples.group.contacts", label: "developer.samples.label.read", method: "GET", target: CONTACT },
  { id: "contact-create", group: "developer.samples.group.contacts", label: "developer.samples.label.create", method: "POST", target: "contacts", body: { "@type": "contact", id: "C-1", contactInfo: card } },
  { id: "contact-replace", group: "developer.samples.group.contacts", label: "developer.samples.label.replace", method: "PUT", target: CONTACT, body: { "@type": "contact", contactInfo: card } },
  {
    id: "contact-patch",
    group: "developer.samples.group.contacts",
    label: "developer.samples.label.change",
    method: "PATCH",
    target: CONTACT,
    body: [{ op: "replace", path: "/contactInfo/emails/email/address", value: "jan.jansen@example.nl" }],
  },
  { id: "contact-delete", group: "developer.samples.group.contacts", label: "developer.samples.label.delete", method: "DELETE", target: CONTACT },
  { id: "contact-transfer-request", group: "developer.samples.group.contacts", label: "developer.samples.label.requestTransfer", method: "POST", target: process(CONTACT, "transferProcesses"), headers: authorization, body: { "@type": "transferProcess", transferDir: "pull" } },
  { id: "contact-transfer-read", group: "developer.samples.group.contacts", label: "developer.samples.label.readLatestTransfer", method: "GET", target: process(CONTACT, "transferProcesses/latest") },
  { id: "contact-transfer-approve", group: "developer.samples.group.contacts", label: "developer.samples.label.approveTransfer", method: "POST", target: process(CONTACT, "transferProcesses/latest/transferApprove") },
  { id: "contact-transfer-reject", group: "developer.samples.group.contacts", label: "developer.samples.label.rejectTransfer", method: "POST", target: process(CONTACT, "transferProcesses/latest/transferReject") },

  { id: "host-availability", group: "developer.samples.group.hosts", label: "developer.samples.label.checkAvailability", method: "GET", target: `${HOST}/availability` },
  { id: "host-read", group: "developer.samples.group.hosts", label: "developer.samples.label.read", method: "GET", target: HOST },
  {
    id: "host-create",
    group: "developer.samples.group.hosts",
    label: "developer.samples.label.create",
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
    group: "developer.samples.group.hosts",
    label: "developer.samples.label.change",
    method: "PATCH",
    target: HOST,
    body: [{ op: "add", path: "/dns/records", value: { "@type": "dnsRecord", name: "ns1.example.nl.", type: "aaaa", rdata: { address: "2001:db8::1" } } }],
  },
  { id: "host-delete", group: "developer.samples.group.hosts", label: "developer.samples.label.delete", method: "DELETE", target: HOST },

  { id: "organisation-read", group: "developer.samples.group.organisations", label: "developer.samples.label.read", method: "GET", target: ORGANISATION },
  {
    id: "organisation-create",
    group: "developer.samples.group.organisations",
    label: "developer.samples.label.create",
    method: "POST",
    target: "organisations",
    body: { "@type": "organisation", id: "ORG-1", roles: { registrar: { "@type": "organisationRole", roleId: "REG-1" } }, contactInfo: card },
  },
  {
    id: "organisation-patch",
    group: "developer.samples.group.organisations",
    label: "developer.samples.label.change",
    method: "PATCH",
    target: ORGANISATION,
    body: [{ op: "add", path: "/status", value: { "@type": "organisationStatus", label: "clientLinkProhibited" } }],
  },
  { id: "organisation-delete", group: "developer.samples.group.organisations", label: "developer.samples.label.delete", method: "DELETE", target: ORGANISATION },
  { id: "user-read", group: "developer.samples.group.organisations", label: "developer.samples.label.readUser", method: "GET", target: `${ORGANISATION}/users/U-1` },
  {
    id: "user-create",
    group: "developer.samples.group.organisations",
    label: "developer.samples.label.createUser",
    method: "POST",
    target: `${ORGANISATION}/users`,
    body: { "@type": "user", id: "U-1", details: card, description: "Registrar staff" },
  },
  {
    id: "user-patch",
    group: "developer.samples.group.organisations",
    label: "developer.samples.label.changeUser",
    method: "PATCH",
    target: `${ORGANISATION}/users/U-1`,
    body: [{ op: "replace", path: "/status", value: { "@type": "userStatus", label: "suspended" } }],
  },
  { id: "user-delete", group: "developer.samples.group.organisations", label: "developer.samples.label.deleteUser", method: "DELETE", target: `${ORGANISATION}/users/U-1` },

  { id: "message-query", group: "developer.samples.group.messages", label: "developer.samples.label.query", method: "GET", target: "messages", query: "type=domainTransfer" },
  { id: "message-read", group: "developer.samples.group.messages", label: "developer.samples.label.read", method: "GET", target: "messages/M-1" },
  { id: "message-acknowledge", group: "developer.samples.group.messages", label: "developer.samples.label.acknowledge", method: "DELETE", target: "messages/M-1" },
];
