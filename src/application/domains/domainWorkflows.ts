import { type ObjectUpdate, fullUpdateOptions } from "@/application/updates/objectUpdate";
import { t } from "@/i18n";
import { toALabel, isAscii } from "@/rpp/core/idn";
import type {
  Availability,
  DnsData,
  DomainName,
  DomainNameCreate,
  DomainNameUpdate,
  Period,
  RenewProcess,
  RestoreProcess,
  RestoreReport,
  TransferProcess,
} from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { describeRecord, dnsRecordOf, isDelegationType, recordProblems, type DnsRecordInput } from "./dnsRecords";
import { invalidRequest } from "@/rpp/operations/paths";
import type { RppClient } from "@/rpp/operations/RppClient";
import type { AvailabilityResult, OperationSuccess } from "@/rpp/operations/types";

/** A domain name as typed and as a URL needs it (core §16.3). */
export interface DomainRef {
  /** The A-label form, which is what the protocol takes as the name. */
  name: string;
  /** What was typed, when that differs from `name`. */
  unicode: string | undefined;
}

/** Whitespace around the name is dropped; nothing else is changed. A name without an A-label form is refused. */
export function parseDomainName(input: string): DomainRef {
  const typed = input.trim();
  if (typed === "") throw invalidRequest(t("domains.errors.emptyDomain"));
  const name = toALabel(typed);
  if (name === undefined || name === "") throw invalidRequest(t("domains.errors.invalidDomain", { name: typed }));
  return { name, unicode: isAscii(typed) ? undefined : typed };
}

/** For showing what a name comes to while it is typed: undefined instead of an error. */
export function tryParseDomainName(input: string): DomainRef | undefined {
  try {
    return parseDomainName(input);
  } catch {
    return undefined;
  }
}

export interface PeriodInput {
  value: number;
  unit: "y" | "m";
}

const periodOf = ({ value, unit }: PeriodInput): Period => ({ "@type": "period", value, unit });

/** The roles a contact of a domain can have besides the registrant. */
export const CONTACT_ROLES = ["admin", "billing", "tech"] as const;

/** The RDATA of a DS record (RFC 4034 §5) and of a DNSKEY record (§2), as presentation-format strings. */
export type DsRdata = Record<"keyTag" | "algorithm" | "digestType" | "digest", string>;
export type DnskeyRdata = Record<"flags" | "protocol" | "algorithm" | "publicKey", string>;

export type DnssecInput = (
  | { type: "ds"; records: readonly DsRdata[] }
  | { type: "dnskey"; records: readonly DnskeyRdata[] }
) & {
  /** Seconds: the child's preference for how long the parent's signature over these records lives (`dns.controls.maxSigLifetime`). */
  maxSigLife?: number;
};

/** The DNS Data element of `domain` from its records and DNSSEC data, each record checked first; undefined when there are none. */
export function dnsDataOf(domain: string, dnssec: DnssecInput | undefined, records: readonly DnsRecordInput[]): DnsData | undefined {
  for (const record of records) {
    const problems = Object.values(recordProblems(record, domain));
    if (problems.length > 0) throw invalidRequest(t("domains.errors.dnsRecordProblem", { record: describeRecord(record), problems: problems.join("; ") }));
  }
  const dnssecRecords = dnssec?.records ?? [];
  const all = [
    ...records.map(dnsRecordOf),
    ...dnssecRecords.map((rdata) => ({ "@type": "dnsRecord" as const, name: "@", type: dnssec?.type ?? "", rdata: { ...rdata } })),
  ];
  if (all.length === 0) return undefined;
  const maxSigLife = dnssec && dnssecRecords.length > 0 ? dnssec.maxSigLife : undefined;
  return {
    "@type": "dnsData",
    records: all,
    ...(dnssec && maxSigLife !== undefined && { controls: { "@type": "dnsControls", maxSigLifetime: { [dnssec.type]: maxSigLife } } }),
  };
}

export interface RegisterInput {
  name: string;
  /** DNSSEC data for the DNS Data element: DS records or DNSKEY records, whose values are sent as the strings given. */
  dnssec?: DnssecInput;
  /**
   * NS, A, AAAA and MX records for the DNS Data element. NS records with their A/AAAA glue delegate the domain without
   * host objects (draft-ietf-rpp-data-objects §11.2), which is how registries without a host object model work.
   */
  records?: readonly DnsRecordInput[];
  /** The Unicode name, when given apart from `name`; it must be the Unicode form of `name`. */
  uName?: string;
  /** Names the Label Generation Ruleset of a Unicode name; the draft requires it with `uName`. */
  lgr?: string;
  period?: PeriodInput;
  registrant?: string;
  contacts?: readonly { label: string; id: string }[];
  nameservers?: readonly string[];
  /** The transfer password, set as the domain's authorisation information (method `authinfo`, the EPP-compatible one). */
  authInfo?: string;
  /** The labels `contacts` may have; default `CONTACT_ROLES`. An active extension can define others. */
  contactRoles?: readonly string[];
  /** Members an active extension adds to the domain (json §7), such as the request contacts of DENIC RRI. */
  extensionMembers?: ExtensionMembers;
}

/** Members an extension adds to a base object. They never replace a member of the base object. */
export type ExtensionMembers = Readonly<Record<string, unknown>>;

/** Adds the members of an extension to a body; a member the body already has is refused, not overwritten. */
export function withExtensionMembers<T extends object>(body: T, members: ExtensionMembers | undefined): T {
  if (!members) return body;
  const clash = Object.keys(members).find((key) => Object.hasOwn(body, key));
  if (clash !== undefined) throw invalidRequest(t("domains.errors.extensionMemberClash", { member: clash }));
  return { ...body, ...members };
}

/** Which host information a domain name read returns (data objects, Domain Name Read): all, delegated, subordinate or none. */
export const HOSTS_FILTERS = ["all", "del", "sub", "none"] as const;
export type HostsFilter = (typeof HOSTS_FILTERS)[number];

export interface RestoreReportInput {
  preData: string;
  postData: string;
  /** RFC 3339. */
  deleteTime: string;
  restoreTime: string;
  restoreReason: string;
  statements: readonly string[];
  other?: string;
}

export interface Signal {
  signal?: AbortSignal;
}

const present = <T>(items: readonly T[] | undefined): T[] | undefined => (items && items.length > 0 ? [...items] : undefined);

function restoreReportOf(input: RestoreReportInput): RestoreReport {
  return {
    "@type": "restoreReport",
    preData: input.preData,
    postData: input.postData,
    deleteTime: input.deleteTime,
    restoreTime: input.restoreTime,
    restoreReason: input.restoreReason,
    statements: [...input.statements],
    ...(input.other ? { other: input.other } : {}),
  };
}

export function registerBody(input: RegisterInput): DomainNameCreate {
  const uName = input.uName?.trim();
  const ref = parseDomainName(input.name.trim() === "" && uName ? uName : input.name);
  if (uName && !isAscii(uName) && ref.unicode === undefined) {
    if (toALabel(uName) !== ref.name) throw invalidRequest(t("domains.errors.unicodeNameMismatch", { uName, name: ref.name }));
    ref.unicode = uName;
  }
  if (ref.unicode !== undefined && !input.lgr) throw invalidRequest(t("domains.errors.unicodeNeedsLgr"));
  const contacts = present(input.contacts);
  const roles: readonly string[] = input.contactRoles ?? CONTACT_ROLES;
  for (const { label } of contacts ?? []) {
    if (!roles.includes(label)) throw invalidRequest(t("domains.errors.invalidContactRole", { label, roles: roles.join(", ") }));
  }
  const nameservers = present(input.nameservers);
  const records = input.records ?? [];
  // The draft: DNS Data "MUST not be used when 1 or more nameservers are specified" (§11.2). DNSSEC records have been
  // sent next to name servers by this client before, so only the delegation and mail records are refused here.
  if (nameservers && records.length > 0) {
    throw invalidRequest(
      records.some((record) => isDelegationType(record.type))
        ? t("domains.errors.hostsOrNsRecords")
        : t("domains.errors.recordsWithHosts"),
    );
  }
  const dns = dnsDataOf(ref.name, input.dnssec, records);
  return withExtensionMembers<DomainNameCreate>({
    "@type": "domainName",
    name: ref.name,
    ...(dns && { dns }),
    ...(ref.unicode !== undefined && { uName: ref.unicode.normalize("NFC"), lgr: input.lgr }),
    ...(input.registrant && { registrant: { "@type": "contact", id: input.registrant } }),
    ...(contacts && { contacts: contacts.map(({ label, id }) => ({ label, object: { "@type": "contact", id } })) }),
    ...(nameservers && { nameservers: nameservers.map((hostName) => ({ "@type": "host", hostName })) }),
    ...(input.authInfo && { authInfo: { "@type": "authInfo", method: "authinfo", authdata: input.authInfo } }),
    ...(input.period && {
      processes: { "@type": "processes", createProcess: [{ "@type": "domainCreateProcess", period: periodOf(input.period) }] },
    }),
  }, input.extensionMembers);
}

export type DomainWorkflows = ReturnType<typeof createDomainWorkflows>;

/** The registrar workflows on domain names, as use cases over the protocol client. */
export function createDomainWorkflows(client: RppClient) {
  const { domains } = client;
  const processOf = <Kind extends "renew" | "restore" | "transfer">(kind: Kind) => {
    const operations = domains.processes[kind];
    if (!operations) throw invalidRequest(t("domains.errors.noProcess", { kind }));
    return operations;
  };
  const typed = async <T>(result: Promise<OperationSuccess<unknown>>) => (await result) as OperationSuccess<T>;

  return {
    /** Whether the name can be registered (GET, so that the reason comes with the answer). */
    async check(input: string, options: Signal = {}): Promise<AvailabilityResult<Availability<string>>> {
      return domains.availability(parseDomainName(input).name, options);
    },

    /** The domain with everything the server shows. `authInfo` is only sent on request, and only to the sponsoring client. */
    async info(input: string, options: Signal & { authInfo?: boolean; hostsFilter?: HostsFilter } = {}): Promise<OperationSuccess<DomainName>> {
      return domains.read(parseDomainName(input).name, {
        signal: options.signal,
        includeElements: options.authInfo ? ["authInfo"] : undefined,
        parameters: options.hostsFilter ? { hostsFilter: options.hostsFilter } : undefined,
      });
    },

    async register(input: RegisterInput, options: Signal = {}): Promise<OperationSuccess<DomainName>> {
      return domains.create(registerBody(input), { signal: options.signal, ...(input.authInfo && { includeElements: ["authInfo"] }) });
    },

    /** Partial update: only what the operations name changes (json §5.2). */
    async change(input: string, operations: readonly PatchOperation[], options: Signal = {}): Promise<OperationSuccess<DomainName>> {
      return domains.patch(parseDomainName(input).name, operations, options);
    },

    /** A partial update (PATCH, json §5.2) or a full update (PUT with the whole update view, json §5.1). */
    async update(input: string, update: ObjectUpdate, options: Signal = {}): Promise<OperationSuccess<DomainName>> {
      const name = parseDomainName(input).name;
      return update.mode === "full" ? domains.replace(name, update.body as DomainNameUpdate, fullUpdateOptions(update, options)) : domains.patch(name, update.operations, options);
    },

    /** Renew. Naming the current expiry date lets the server refuse a renewal that was already done. */
    async renew(input: string, renewal: { expiryDate?: string; period?: PeriodInput }, options: Signal = {}): Promise<OperationSuccess<RenewProcess>> {
      const body: RenewProcess = {
        "@type": "renewProcess",
        ...(renewal.expiryDate && { expiryDate: renewal.expiryDate }),
        ...(renewal.period && { renewalPeriod: periodOf(renewal.period) }),
      };
      return typed(processOf("renew").create(parseDomainName(input).name, body, options));
    },

    restore: {
      /** Starts the restore of a domain in its redemption period. A report may go with it, when the server takes one there. */
      async request(input: string, report?: RestoreReportInput, options: Signal = {}): Promise<OperationSuccess<RestoreProcess>> {
        const body = { "@type": "restoreProcess", ...(report && { restoreReport: restoreReportOf(report) }) };
        return typed(processOf("restore").create(parseDomainName(input).name, body, options));
      },
      /** Sends the report of a restore that is pending. A report replaces an earlier one. */
      async report(input: string, report: RestoreReportInput, options: Signal = {}): Promise<OperationSuccess<RestoreProcess>> {
        const body = { "@type": "restoreProcess", restoreReport: restoreReportOf(report) };
        return typed(processOf("restore").update(parseDomainName(input).name, "latest", body, options));
      },
      async status(input: string, options: Signal = {}): Promise<OperationSuccess<RestoreProcess>> {
        return typed(processOf("restore").read(parseDomainName(input).name, "latest", options));
      },
    },

    transfer: {
      /**
       * Asks for the domain to be transferred to this client; the password goes in `RPP-Authorization`, never the body.
       * `extensionMembers` are the input data elements an active extension adds to the request.
       */
      async request(
        input: string,
        transfer: { authInfo: string; period?: PeriodInput; extensionMembers?: ExtensionMembers },
        options: Signal = {},
      ): Promise<OperationSuccess<TransferProcess>> {
        const body = withExtensionMembers(
          { "@type": "domainTransferProcess", ...(transfer.period && { transferPeriod: periodOf(transfer.period) }) },
          transfer.extensionMembers,
        );
        return typed(
          processOf("transfer").create(parseDomainName(input).name, body, { ...options, authorization: { value: transfer.authInfo } }),
        );
      },
      async status(input: string, options: Signal = {}): Promise<OperationSuccess<TransferProcess>> {
        return typed(processOf("transfer").read(parseDomainName(input).name, "latest", options));
      },
      /** The requesting client withdraws its request. */
      async cancel(input: string, options: Signal = {}): Promise<OperationSuccess<unknown>> {
        return processOf("transfer").delete(parseDomainName(input).name, "latest", options);
      },
      /** The sponsoring client lets the transfer go ahead. */
      async approve(input: string, options: Signal = {}): Promise<OperationSuccess<unknown>> {
        return processOf("transfer").approve(parseDomainName(input).name, "latest", options);
      },
      /** The sponsoring client refuses it. */
      async reject(input: string, options: Signal = {}): Promise<OperationSuccess<unknown>> {
        return processOf("transfer").reject(parseDomainName(input).name, "latest", undefined, options);
      },
    },

    async remove(input: string, options: Signal = {}): Promise<OperationSuccess<unknown>> {
      return domains.delete(parseDomainName(input).name, options);
    },
  };
}
