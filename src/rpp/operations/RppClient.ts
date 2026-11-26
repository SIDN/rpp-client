import type { RppTransport } from "../client/RppTransport";
import type {
  Contact,
  ContactCreate,
  ContactUpdate,
  DomainName,
  DomainNameCreate,
  DomainNameUpdate,
  Host,
  HostCreate,
  HostUpdate,
  Organisation,
  OrganisationCreate,
  OrganisationUpdate,
  User,
  UserCreate,
  UserUpdate,
} from "../core/types/objects";
import type { OperationContext } from "./context";
import { RESOURCES } from "./definitions";
import { createMessageOperations, type MessageOperations } from "./messageOperations";
import { segment } from "./paths";
import { createResourceOperations, type ResourceOperations } from "./resourceOperations";
import type { ValidationConfig } from "./types";

export interface RppClientConfig {
  transport: RppTransport;
  validation?: ValidationConfig;
  /** Default Accept-Language. */
  language?: string;
}

export interface RppClient {
  readonly domains: ResourceOperations<DomainName, DomainNameCreate, DomainNameUpdate>;
  readonly contacts: ResourceOperations<Contact, ContactCreate, ContactUpdate>;
  readonly hosts: ResourceOperations<Host, HostCreate, HostUpdate>;
  readonly organisations: ResourceOperations<Organisation, OrganisationCreate, OrganisationUpdate>;
  /** The users of one organisation. */
  users(organisationId: string): ResourceOperations<User, UserCreate, UserUpdate>;
  readonly messages: MessageOperations;
  /**
   * The operations an extension module defines, over this client's transport and validation. The factory is called
   * once per client. The core client knows no extension: whether the server offers one is for discovery to say.
   */
  extension<T>(factory: ExtensionOperationsFactory<T>): T;
}

/** Builds the operations of an extension from the context the core operations share. */
export type ExtensionOperationsFactory<T> = (context: OperationContext) => T;

/**
 * The typed protocol operations on top of a transport. Operations resolve with the data and the response metadata,
 * and reject with `RppError` for every failure. Nothing is retried: a repeat reuses its RPP-Cltrid only when the caller says so.
 */
export function createRppClient(config: RppClientConfig): RppClient {
  const context: OperationContext = {
    transport: config.transport,
    validation: config.validation,
    language: config.language,
  };
  const extensions = new Map<ExtensionOperationsFactory<unknown>, unknown>();
  return {
    domains: createResourceOperations(context, RESOURCES.domainName, RESOURCES.domainName.collection),
    contacts: createResourceOperations(context, RESOURCES.contact, RESOURCES.contact.collection),
    hosts: createResourceOperations(context, RESOURCES.host, RESOURCES.host.collection),
    organisations: createResourceOperations(context, RESOURCES.organisation, RESOURCES.organisation.collection),
    users: (organisationId) =>
      createResourceOperations(
        context,
        RESOURCES.user,
        `${RESOURCES.organisation.collection}/${segment(organisationId, "organisation identifier")}/${RESOURCES.user.collection}`,
      ),
    messages: createMessageOperations(context),
    extension<T>(factory: ExtensionOperationsFactory<T>): T {
      if (!extensions.has(factory)) extensions.set(factory, factory(context));
      return extensions.get(factory) as T;
    },
  };
}
