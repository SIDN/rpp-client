import { isJsonObject } from "./json";
import type { RppObject } from "./objects";

/** The resource objects of the data model and the member that identifies each (the `reference` view of the JSON schema). */
export const RESOURCE_TYPES = {
  domainName: { identifier: "name" },
  host: { identifier: "hostName" },
  contact: { identifier: "id" },
  organisation: { identifier: "id" },
  user: { identifier: "id" },
  message: { identifier: "id" },
} as const;

export type ResourceType = keyof typeof RESOURCE_TYPES;

export const isResourceType = (value: unknown): value is ResourceType =>
  typeof value === "string" && Object.hasOwn(RESOURCE_TYPES, value);

/** The `@type` of a value, if it is an RPP object. */
export function objectTypeOf(value: unknown): string | undefined {
  return isJsonObject(value) && typeof value["@type"] === "string" ? value["@type"] : undefined;
}

export const isRppObject = (value: unknown): value is RppObject => objectTypeOf(value) !== undefined;

export function isObjectOfType<Type extends string>(value: unknown, type: Type): value is RppObject<Type> {
  return objectTypeOf(value) === type;
}

/** The value of the member that identifies a resource object, when the object is a known resource type. */
export function identifierOf(value: unknown): string | undefined {
  const type = objectTypeOf(value);
  if (!isJsonObject(value) || !isResourceType(type)) return undefined;
  const identifier = value[RESOURCE_TYPES[type].identifier];
  return typeof identifier === "string" ? identifier : undefined;
}
