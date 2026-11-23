import { toALabel, isAscii } from "@/rpp/core/idn";
import type {
  Availability,
  DomainName,
  DomainNameCreate,
  Period,
  RenewProcess,
  RestoreProcess,
  RestoreReport,
  TransferProcess,
} from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
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
  if (typed === "") throw invalidRequest("Enter a domain name");
  const name = toALabel(typed);
  if (name === undefined || name === "") throw invalidRequest(`${typed} cannot be converted to an A-label, so it cannot be a domain name`);
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

export interface RegisterInput {
  name: string;
  /** Names the Label Generation Ruleset of a Unicode name; the draft requires it with `uName`. */
  lgr?: string;
  period?: PeriodInput;
  registrant?: string;
  contacts?: readonly { label: string; id: string }[];
  nameservers?: readonly string[];
  /** The transfer password, set as the domain's authorisation information (method `authinfo`, the EPP-compatible one). */
  authInfo?: string;
}

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
  const ref = parseDomainName(input.name);
  if (ref.unicode !== undefined && !input.lgr) throw invalidRequest("A Unicode name needs the name of its Label Generation Ruleset");
  const contacts = present(input.contacts);
  for (const { label } of contacts ?? []) {
    if (!(CONTACT_ROLES as readonly string[]).includes(label)) throw invalidRequest(`A contact role is admin, billing or tech, not ${label}`);
  }
  const nameservers = present(input.nameservers);
  return {
    "@type": "domainName",
    name: ref.name,
    ...(ref.unicode !== undefined && { uName: ref.unicode.normalize("NFC"), lgr: input.lgr }),
    ...(input.registrant && { registrant: { "@type": "contact", id: input.registrant } }),
    ...(contacts && { contacts: contacts.map(({ label, id }) => ({ label, object: { "@type": "contact", id } })) }),
    ...(nameservers && { nameservers: nameservers.map((hostName) => ({ "@type": "host", hostName })) }),
    ...(input.authInfo && { authInfo: { "@type": "authInfo", method: "authinfo", authdata: input.authInfo } }),
    ...(input.period && {
      processes: { "@type": "processes", createProcess: [{ "@type": "domainCreateProcess", period: periodOf(input.period) }] },
    }),
  };
}

export type DomainWorkflows = ReturnType<typeof createDomainWorkflows>;

/** The registrar workflows on domain names, as use cases over the protocol client. */
export function createDomainWorkflows(client: RppClient) {
  const { domains } = client;
  const processOf = <Kind extends "renew" | "restore" | "transfer">(kind: Kind) => {
    const operations = domains.processes[kind];
    if (!operations) throw invalidRequest(`Domain names have no ${kind} process`);
    return operations;
  };
  const typed = async <T>(result: Promise<OperationSuccess<unknown>>) => (await result) as OperationSuccess<T>;

  return {
    /** Whether the name can be registered (GET, so that the reason comes with the answer). */
    async check(input: string, options: Signal = {}): Promise<AvailabilityResult<Availability<string>>> {
      return domains.availability(parseDomainName(input).name, options);
    },

    /** The domain with everything the server shows. `authInfo` is only sent on request, and only to the sponsoring client. */
    async info(input: string, options: Signal & { authInfo?: boolean } = {}): Promise<OperationSuccess<DomainName>> {
      return domains.read(parseDomainName(input).name, {
        signal: options.signal,
        includeElements: options.authInfo ? ["authInfo"] : undefined,
      });
    },

    async register(input: RegisterInput, options: Signal = {}): Promise<OperationSuccess<DomainName>> {
      return domains.create(registerBody(input), { signal: options.signal, ...(input.authInfo && { includeElements: ["authInfo"] }) });
    },

    /** Partial update: only what the operations name changes (json §5.2). */
    async change(input: string, operations: readonly PatchOperation[], options: Signal = {}): Promise<OperationSuccess<DomainName>> {
      return domains.patch(parseDomainName(input).name, operations, options);
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
      /** Asks for the domain to be transferred to this client; the password goes in `RPP-Authorization`, never the body. */
      async request(input: string, transfer: { authInfo: string; period?: PeriodInput }, options: Signal = {}): Promise<OperationSuccess<TransferProcess>> {
        const body = { "@type": "domainTransferProcess", ...(transfer.period && { transferPeriod: periodOf(transfer.period) }) };
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
