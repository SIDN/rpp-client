import type { ResourceDefinition } from "../../../operations/definitions";
import type { PatchOperation } from "../../../operations/patch";
import { createResourceOperations, type AvailabilityOptions, type ParameterOptions } from "../../../operations/resourceOperations";
import type { ExtensionOperationsFactory } from "../../../operations/RppClient";
import type { AvailabilityResult, OperationSuccess } from "../../../operations/types";
import { RRI_SCHEMA_PREFIX } from "./module";
import type { RequestContact, RequestContactAvailability, RequestContactCreate, RequestContactUpdate } from "./types";

/**
 * The Request Contact Data Object (§Request Contact Data Object, §Endpoints). Its paths follow core §16.1 from the
 * identifier `requestContact`; it has no processes, and a client provides the identifier (core Rule 1).
 */
export const REQUEST_CONTACT_RESOURCE: ResourceDefinition = {
  type: "requestContact",
  schemaPrefix: `${RRI_SCHEMA_PREFIX}requestContact`,
  collection: "requestContacts",
  availabilityType: "requestContactAvailability",
  aLabelIdentifier: false,
  processes: {},
};

/**
 * The operations of a request contact. There is no delete: the extension does not support it (§Delete Operation; the
 * server answers 501 with 02101), and the registry removes request contacts no domain refers to by itself.
 */
export interface RequestContactOperations {
  readonly definition: ResourceDefinition;
  /** Whether a request contact with this identifier can be created. A 404 is an answer, not a failure (core §16.4). */
  availability(id: string, options?: AvailabilityOptions): Promise<AvailabilityResult<RequestContactAvailability>>;
  read(id: string, options?: ParameterOptions): Promise<OperationSuccess<RequestContact>>;
  create(body: RequestContactCreate, options?: ParameterOptions): Promise<OperationSuccess<RequestContact>>;
  /** Full update (PUT) of the URI Template. */
  replace(id: string, body: RequestContactUpdate, options?: ParameterOptions): Promise<OperationSuccess<RequestContact>>;
  /** Partial update (PATCH) with JSON Patch operations (json §5.2). */
  patch(id: string, operations: readonly PatchOperation[], options?: ParameterOptions): Promise<OperationSuccess<RequestContact>>;
}

export const requestContactOperations: ExtensionOperationsFactory<RequestContactOperations> = (context) => {
  const operations = createResourceOperations<RequestContact, RequestContactCreate, RequestContactUpdate>(
    context,
    REQUEST_CONTACT_RESOURCE,
    REQUEST_CONTACT_RESOURCE.collection,
  );
  return {
    definition: REQUEST_CONTACT_RESOURCE,
    availability: async (id, options) => (await operations.availability(id, options)) as AvailabilityResult<RequestContactAvailability>,
    read: operations.read,
    create: operations.create,
    replace: operations.replace,
    patch: operations.patch,
  };
};
