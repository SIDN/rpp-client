import { isAscii, toALabel } from "@/rpp/core/idn";
import type { Availability, Host, HostCreate } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";
import { invalidRequest } from "@/rpp/operations/paths";
import type { RppClient } from "@/rpp/operations/RppClient";
import type { AvailabilityResult, OperationSuccess } from "@/rpp/operations/types";
import { cleanAddresses, ipVersionOf, addressRecordOf, nsRecordOf } from "./hostData";

/** A host name as typed and as a URL needs it (core §16.3). */
export interface HostRef {
  /** The A-label form, which is what the protocol takes as the host name. */
  name: string;
  /** What was typed, when that differs from `name`. */
  unicode: string | undefined;
}

/** Whitespace around the name is dropped; nothing else is changed. A name without an A-label form is refused. */
export function parseHostName(input: string): HostRef {
  const typed = input.trim();
  if (typed === "") throw invalidRequest("Enter a host name");
  const name = toALabel(typed);
  if (name === undefined || name === "") throw invalidRequest(`${typed} cannot be converted to an A-label, so it cannot be a host name`);
  return { name, unicode: isAscii(typed) ? undefined : typed };
}

/** For showing what a name comes to while it is typed: undefined instead of an error. */
export function tryParseHostName(input: string): HostRef | undefined {
  try {
    return parseHostName(input);
  } catch {
    return undefined;
  }
}

export interface CreateHostInput {
  name: string;
  /** IPv4 and IPv6 addresses, glue for a host below a domain of this registry; none for a host elsewhere. */
  addresses?: readonly string[];
}

/** A host as a create request has it: its own `ns` record and one record for each address. */
export function createBody(input: CreateHostInput): HostCreate {
  const ref = parseHostName(input.name);
  const addresses = cleanAddresses(input.addresses ?? []);
  for (const address of addresses) {
    if (ipVersionOf(address) === undefined) throw invalidRequest(`${address} is not an IPv4 or IPv6 address`);
  }
  return {
    "@type": "host",
    hostName: ref.name,
    dns: { "@type": "dnsData", records: [nsRecordOf(ref.name), ...addresses.map((address) => addressRecordOf(ref.name, address))] },
  };
}

export interface Signal {
  signal?: AbortSignal;
}

export type HostWorkflows = ReturnType<typeof createHostWorkflows>;

/** The registrar workflows on hosts, as use cases over the protocol client. */
export function createHostWorkflows(client: RppClient) {
  const { hosts } = client;

  return {
    /** Whether the name is free (GET, so that the reason comes with the answer). */
    async check(name: string, options: Signal = {}): Promise<AvailabilityResult<Availability<string>>> {
      return hosts.availability(parseHostName(name).name, options);
    },

    async info(name: string, options: Signal = {}): Promise<OperationSuccess<Host>> {
      return hosts.read(parseHostName(name).name, options);
    },

    async create(input: CreateHostInput, options: Signal = {}): Promise<OperationSuccess<Host>> {
      return hosts.create(createBody(input), options);
    },

    /** Partial update: only what the operations name changes (json §5.2). */
    async change(name: string, operations: readonly PatchOperation[], options: Signal = {}): Promise<OperationSuccess<Host>> {
      return hosts.patch(parseHostName(name).name, operations, options);
    },

    async remove(name: string, options: Signal = {}): Promise<OperationSuccess<unknown>> {
      return hosts.delete(parseHostName(name).name, options);
    },
  };
}
