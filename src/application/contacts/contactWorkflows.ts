import { type ObjectUpdate, fullUpdateOptions } from "@/application/updates/objectUpdate";
import type { Availability, Contact, ContactCreate, ContactUpdate, TransferProcess } from "@/rpp/core/types/objects";
import { t } from "@/i18n";
import type { PatchOperation } from "@/rpp/operations/patch";
import { invalidRequest } from "@/rpp/operations/paths";
import type { RppClient } from "@/rpp/operations/RppClient";
import type { AvailabilityResult, OperationSuccess } from "@/rpp/operations/types";
import { cardOf, type ContactData, type PostalMode } from "./contactCard";

/** Whitespace around the identifier is dropped; nothing else is changed. */
export function parseContactId(input: string): string {
  const id = input.trim();
  if (id === "") throw invalidRequest(t("contacts.errors.enterIdentifier"));
  return id;
}

export interface CreateContactInput {
  id: string;
  data: ContactData;
  /** The transfer password, set as the contact's authorisation information (method `authinfo`). */
  authInfo?: string;
  /** Where the registry keeps the name, organisation and address; default the Card and its localization. */
  mode?: PostalMode;
}

export function createBody(input: CreateContactInput): ContactCreate {
  return {
    "@type": "contact",
    id: parseContactId(input.id),
    contactInfo: cardOf(input.data, input.mode),
    ...(input.authInfo && { authInfo: { "@type": "authInfo", method: "authinfo", authdata: input.authInfo } }),
  };
}

export interface Signal {
  signal?: AbortSignal;
}

export type ContactWorkflows = ReturnType<typeof createContactWorkflows>;

/** The registrar workflows on contacts, as use cases over the protocol client. */
export function createContactWorkflows(client: RppClient) {
  const { contacts } = client;
  const transferOf = () => {
    const operations = contacts.processes.transfer;
    if (!operations) throw invalidRequest(t("contacts.errors.noTransferProcess"));
    return operations;
  };
  const typed = async <T>(result: Promise<OperationSuccess<unknown>>) => (await result) as OperationSuccess<T>;

  return {
    /** Whether the identifier is free (GET, so that the reason comes with the answer). */
    async check(id: string, options: Signal = {}): Promise<AvailabilityResult<Availability<string>>> {
      return contacts.availability(parseContactId(id), options);
    },

    /** The contact with everything the server shows. `authInfo` is only sent on request, and only to the sponsoring client. */
    async info(id: string, options: Signal & { authInfo?: boolean } = {}): Promise<OperationSuccess<Contact>> {
      return contacts.read(parseContactId(id), { signal: options.signal, includeElements: options.authInfo ? ["authInfo"] : undefined });
    },

    async create(input: CreateContactInput, options: Signal = {}): Promise<OperationSuccess<Contact>> {
      return contacts.create(createBody(input), { signal: options.signal, ...(input.authInfo && { includeElements: ["authInfo"] }) });
    },

    /** Partial update: only what the operations name changes (json §5.2). */
    async change(id: string, operations: readonly PatchOperation[], options: Signal = {}): Promise<OperationSuccess<Contact>> {
      return contacts.patch(parseContactId(id), operations, options);
    },

    /** A partial update (PATCH, json §5.2) or a full update (PUT with the whole update view, json §5.1). */
    async update(id: string, update: ObjectUpdate, options: Signal = {}): Promise<OperationSuccess<Contact>> {
      const contactId = parseContactId(id);
      return update.mode === "full" ? contacts.replace(contactId, update.body as ContactUpdate, fullUpdateOptions(update, options)) : contacts.patch(contactId, update.operations, options);
    },

    transfer: {
      /** Asks for the contact to be transferred to this client; the password goes in `RPP-Authorization`, never the body. */
      async request(id: string, transfer: { authInfo: string }, options: Signal = {}): Promise<OperationSuccess<TransferProcess>> {
        const body = { "@type": "transferProcess", transferDir: "pull" };
        return typed(transferOf().create(parseContactId(id), body, { ...options, authorization: { value: transfer.authInfo } }));
      },
      async status(id: string, options: Signal = {}): Promise<OperationSuccess<TransferProcess>> {
        return typed(transferOf().read(parseContactId(id), "latest", options));
      },
      /** The requesting client withdraws its request. */
      async cancel(id: string, options: Signal = {}): Promise<OperationSuccess<unknown>> {
        return transferOf().delete(parseContactId(id), "latest", options);
      },
      /** The sponsoring client lets the transfer go ahead. */
      async approve(id: string, options: Signal = {}): Promise<OperationSuccess<unknown>> {
        return transferOf().approve(parseContactId(id), "latest", options);
      },
      /** The sponsoring client refuses it. */
      async reject(id: string, options: Signal = {}): Promise<OperationSuccess<unknown>> {
        return transferOf().reject(parseContactId(id), "latest", undefined, options);
      },
    },

    async remove(id: string, options: Signal = {}): Promise<OperationSuccess<unknown>> {
      return contacts.delete(parseContactId(id), options);
    },
  };
}
