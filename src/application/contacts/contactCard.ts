import { STATUS_VOCABULARIES } from "@/rpp/core/status/statuses";
import { isJsonObject } from "@/rpp/core/types/json";
import type { Contact } from "@/rpp/core/types/objects";
import type { PatchOperation } from "@/rpp/operations/patch";

export const CONTACT_KINDS = ["individual", "org"] as const;
export const STREET_LINES = 3;

/** The two forms of a postal address of EPP (RFC 5733 `postalInfo`): `int` is the Card itself, `loc` its localization. */
export const ADDRESS_TYPES = ["int", "loc"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

/** The language the localization of a contact is keyed by when it has none yet: undetermined (BCP 47). */
export const LOCALIZATION_KEY = "und";

/**
 * Where a registry keeps the name, the organisation and the address of a contact, as its Preset Schema allows (see
 * `contactSupport`). `both`: in the Card itself (the `int` form) and in its localization (the `loc` form). `card-only`: in
 * the Card alone. `localized-only`: in the localization alone, as an EPP server that holds only
 * `<contact:postalInfo type="loc">` has it; its profile refuses them in the Card.
 */
export type PostalMode = "both" | "card-only" | "localized-only";

export interface AddressData {
  /** Always `STREET_LINES` entries, empty ones included. */
  street: string[];
  city: string;
  region: string;
  postcode: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
}

export const EMPTY_ADDRESS: AddressData = {
  street: Array.from({ length: STREET_LINES }, () => ""),
  city: "",
  region: "",
  postcode: "",
  country: "",
};

/** What the forms edit of a contact: the members of its Card that an EPP-style registry holds, as plain text. */
export interface ContactData {
  /** Empty when the contact has none, or the registry derives it. */
  kind: "" | (typeof CONTACT_KINDS)[number];
  name: string;
  organisation: string;
  /** The international address (`int`): the Card's own, US-ASCII only. */
  address: AddressData;
  /** The localized address (`loc`): that of the localization of the Card, in any characters. */
  localAddress: AddressData;
  /** `+CC.number`, with `xEXT` for an extension; empty for none. */
  voice: string;
  fax: string;
  email: string;
}

export const EMPTY_CONTACT: ContactData = {
  kind: "",
  name: "",
  organisation: "",
  address: EMPTY_ADDRESS,
  localAddress: EMPTY_ADDRESS,
  voice: "",
  fax: "",
  email: "",
};

/** The form of a number EPP and the JSContact profile of RPP share (rpp-telephone-uri). */
export const PHONE_PATTERN = /^\+(\d{1,3})\.(\d{1,14})(?:x(\d+))?$/;

/** `+31.201234567x12` as a telephone URI, `tel:+31.201234567;ext=12`; undefined when it is not such a number. */
export function toTelUri(number: string): string | undefined {
  const match = PHONE_PATTERN.exec(number.trim());
  if (!match || (match[1] ?? "").length + (match[2] ?? "").length > 15) return undefined;
  return `tel:+${match[1]}.${match[2]}${match[3] ? `;ext=${match[3]}` : ""}`;
}

export function fromTelUri(uri: string): string {
  const match = /^tel:(\+\d{1,3}\.\d+)(?:;ext=(\d+))?$/.exec(uri);
  return match ? `${match[1]}${match[2] ? `x${match[2]}` : ""}` : uri;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const record = (value: unknown): Record<string, unknown> => (isJsonObject(value) ? value : {});

function addressOf(addresses: unknown): AddressData {
  return addressFrom(record(record(addresses).addr));
}

function addressFrom(address: Record<string, unknown>): AddressData {
  const components = (Array.isArray(address.components) ? address.components : []).map(record);
  const component = (kind: string) => components.filter((entry) => entry.kind === kind).map((entry) => text(entry.value));
  const street = component("name");
  return {
    street: [...street, ...EMPTY_ADDRESS.street].slice(0, Math.max(STREET_LINES, street.length)),
    city: component("locality")[0] ?? "",
    region: component("region")[0] ?? "",
    postcode: component("postcode")[0] ?? "",
    country: text(address.countryCode),
  };
}

/** The key of the localization the contact has, else the undetermined language. The registry holds at most one. */
export function localizationKeyOf(contact: Contact): string {
  return Object.keys(record(record(contact.contactInfo).localizations))[0] ?? LOCALIZATION_KEY;
}

/** An address of a localization, with the keys of the Card it is held under. */
export interface LocalizedAddress {
  localization: string;
  key: string;
  address: AddressData;
}

/** Every address of every localization of the Card, in the order received. */
export function localizedAddressesOf(contact: Contact): LocalizedAddress[] {
  return Object.entries(record(record(contact.contactInfo).localizations)).flatMap(([localization, value]) =>
    Object.entries(record(record(value).addresses)).map(([key, address]) => ({ localization, key, address: addressFrom(record(address)) })),
  );
}

/** How a contact read back keeps its postal info: in the localization alone when the Card itself has none of it. */
export function postalModeOfContact(contact: Contact): PostalMode {
  const card = record(contact.contactInfo);
  const own = card.name !== undefined || card.organizations !== undefined || card.addresses !== undefined;
  return !own && card.localizations !== undefined ? "localized-only" : "both";
}

/** Reads the members the forms edit from the Card of a contact; the rest of the Card is left where it is. */
export function dataOf(contact: Contact, mode: PostalMode = "both"): ContactData {
  const card = record(contact.contactInfo);
  const localizations = record(card.localizations);
  const localization = record(localizations[localizationKeyOf(contact)]);
  const phones = record(card.phones);
  const source = mode === "localized-only" ? localization : card;
  return {
    kind: card.kind === "individual" || card.kind === "org" ? card.kind : "",
    name: text(record(source.name).full),
    organisation: text(record(record(source.organizations).org).name),
    address: mode === "localized-only" ? EMPTY_ADDRESS : addressOf(card.addresses),
    localAddress: mode === "card-only" ? EMPTY_ADDRESS : addressOf(localization.addresses),
    voice: fromTelUri(text(record(phones.voice).number)),
    fax: fromTelUri(text(record(phones.fax).number)),
    email: text(record(record(card.emails).email).address),
  };
}

const filled = (value: string) => value.trim() !== "";

function cleanAddress(address: AddressData): AddressData {
  return {
    street: address.street.map((line) => line.trim()).filter(filled),
    city: address.city.trim(),
    region: address.region.trim(),
    postcode: address.postcode.trim(),
    country: address.country.trim(),
  };
}

function clean(data: ContactData): ContactData {
  return {
    ...data,
    name: data.name.trim(),
    organisation: data.organisation.trim(),
    address: cleanAddress(data.address),
    localAddress: cleanAddress(data.localAddress),
    voice: data.voice.trim(),
    fax: data.fax.trim(),
    email: data.email.trim(),
  };
}

export const hasAddress = (address: AddressData) => address.street.some(filled) || [address.city, address.region, address.postcode, address.country].some(filled);

function componentsOf(address: AddressData) {
  return [
    ...address.street.map((value) => ({ kind: "name", value })),
    ...(address.city ? [{ kind: "locality", value: address.city }] : []),
    ...(address.region ? [{ kind: "region", value: address.region }] : []),
    ...(address.postcode ? [{ kind: "postcode", value: address.postcode }] : []),
  ];
}

const addressMembers = (address: AddressData) => ({ addr: { components: componentsOf(address), ...(address.country && { countryCode: address.country }) } });

/** The Card of a new contact: only what was filled in. Phone numbers that are not `+CC.number` are left out. */
export function cardOf(input: ContactData, mode: PostalMode = "both"): Record<string, unknown> {
  const data = clean(input);
  const voice = toTelUri(data.voice);
  const fax = toTelUri(data.fax);
  const own = mode !== "localized-only";
  const localization = {
    ...(!own && data.name && { name: { full: data.name } }),
    ...(!own && data.organisation && { organizations: { org: { name: data.organisation } } }),
    ...(mode !== "card-only" && hasAddress(data.localAddress) && { addresses: addressMembers(data.localAddress) }),
  };
  return {
    "@type": "Card",
    version: "2.0",
    ...(data.kind && { kind: data.kind }),
    ...(own && data.name && { name: { full: data.name } }),
    ...(own && data.organisation && { organizations: { org: { name: data.organisation } } }),
    ...(own && hasAddress(data.address) && { addresses: addressMembers(data.address) }),
    ...((voice || fax) && { phones: { ...(voice && { voice: { number: voice } }), ...(fax && { fax: { number: fax, features: { fax: true } } }) } }),
    ...(data.email && { emails: { email: { address: data.email } } }),
    ...(Object.keys(localization).length > 0 && { localizations: { [LOCALIZATION_KEY]: localization } }),
  };
}

export type ContactAuthInfoEdit = { action: "keep" } | { action: "set"; value: string };

/** What the Change form edits: the data, the client statuses, and the transfer password. The kind is not editable. */
export interface ContactEdit extends ContactData {
  clientStatuses: string[];
  authInfo: ContactAuthInfoEdit;
}

export const CONTACT_CLIENT_STATUSES: readonly string[] = STATUS_VOCABULARIES.contactStatus.clientSettable;

export function editOf(contact: Contact, mode: PostalMode = "both"): ContactEdit {
  return {
    ...dataOf(contact, mode),
    clientStatuses: contact.status.map((status) => status.label).filter((label) => CONTACT_CLIENT_STATUSES.includes(label)),
    authInfo: { action: "keep" },
  };
}

const CARD = "/contactInfo";

/** Where an address lives and how it is added to or taken out of a contact as a whole. */
interface AddressPlace {
  /** The path of its `addresses` member. */
  addresses: string;
  addWhole(address: AddressData): PatchOperation;
  removeWhole: PatchOperation;
}

function addressOperations(place: AddressPlace, before: AddressData, wanted: AddressData): PatchOperation[] {
  if (!hasAddress(before) && hasAddress(wanted)) return [place.addWhole(wanted)];
  if (hasAddress(before) && !hasAddress(wanted)) return [place.removeWhole];
  if (!hasAddress(before)) return [];

  const operations: PatchOperation[] = [];
  const components = `${place.addresses}/addr/components`;
  for (const line of before.street) {
    if (!wanted.street.includes(line)) operations.push({ op: "remove", path: components, match: { kind: "name", value: line } });
  }
  for (const line of wanted.street) {
    if (!before.street.includes(line)) operations.push({ op: "add", path: components, value: { kind: "name", value: line } });
  }
  for (const [kind, key] of [["locality", "city"], ["region", "region"], ["postcode", "postcode"]] as const) {
    const was = before[key];
    const now = wanted[key];
    if (now === was) continue;
    if (now === "") operations.push({ op: "remove", path: components, match: { kind } });
    else if (was === "") operations.push({ op: "add", path: components, value: { kind, value: now } });
    else operations.push({ op: "replace", path: components, match: { kind }, value: { kind, value: now } });
  }
  if (wanted.country !== before.country && wanted.country !== "") {
    operations.push({ op: "replace", path: `${place.addresses}/addr/countryCode`, value: wanted.country });
  }
  return operations;
}

/**
 * The JSON Patch (json §5.2) that turns `current` into `edit`: one operation per member that was added, changed or
 * removed, so what the form does not show stays as the registry has it. Empty when nothing changed. Whether a member
 * may be changed or removed is the registry's to say.
 */
export function buildContactPatch(current: Contact, edit: ContactEdit, mode: PostalMode = "both"): PatchOperation[] {
  const before = clean(dataOf(current, mode));
  const wanted = clean(edit);
  const operations: PatchOperation[] = [];
  const key = localizationKeyOf(current);
  const localization = `${CARD}/localizations/${key}`;
  const hasLocalization = key in record(record(current.contactInfo).localizations);
  // Where the name and the organisation are: in the Card, or in its localization when that alone holds them.
  const postal = mode === "localized-only" ? localization : CARD;

  if (wanted.name !== before.name) {
    if (wanted.name === "") operations.push({ op: "remove", path: `${postal}/name` });
    else if (before.name === "") operations.push({ op: "add", path: `${postal}/name`, value: { full: wanted.name } });
    else operations.push({ op: "replace", path: `${postal}/name/full`, value: wanted.name });
  }

  if (wanted.organisation !== before.organisation) {
    if (wanted.organisation === "") operations.push({ op: "remove", path: `${postal}/organizations/org` });
    else if (before.organisation === "") operations.push({ op: "add", path: `${postal}/organizations`, value: { org: { name: wanted.organisation } } });
    else operations.push({ op: "replace", path: `${postal}/organizations/org/name`, value: wanted.organisation });
  }

  if (mode !== "localized-only") operations.push(
    ...addressOperations(
      {
        addresses: `${CARD}/addresses`,
        addWhole: (address) => ({ op: "add", path: `${CARD}/addresses`, value: addressMembers(address) }),
        removeWhole: { op: "remove", path: `${CARD}/addresses/addr` },
      },
      before.address,
      wanted.address,
    ),
  );

  if (mode !== "card-only") operations.push(
    ...addressOperations(
      {
        addresses: `${localization}/addresses`,
        addWhole: (address) =>
          hasLocalization
            ? { op: "add", path: `${localization}/addresses`, value: addressMembers(address) }
            : { op: "add", path: `${CARD}/localizations`, value: { [key]: { addresses: addressMembers(address) } } },
        removeWhole: { op: "remove", path: `${localization}/addresses` },
      },
      before.localAddress,
      wanted.localAddress,
    ),
  );

  for (const field of ["voice", "fax"] as const) {
    if (wanted[field] === before[field]) continue;
    const entry = `${CARD}/phones/${field}`;
    const uri = toTelUri(wanted[field]);
    if (wanted[field] === "") operations.push({ op: "remove", path: entry });
    else if (uri === undefined) continue;
    else if (before[field] === "") operations.push({ op: "add", path: entry, value: { number: uri, ...(field === "fax" && { features: { fax: true } }) } });
    else operations.push({ op: "replace", path: `${entry}/number`, value: uri });
  }

  if (wanted.email !== before.email) {
    const entry = `${CARD}/emails/email`;
    if (wanted.email === "") operations.push({ op: "remove", path: entry });
    else if (before.email === "") operations.push({ op: "add", path: entry, value: { address: wanted.email } });
    else operations.push({ op: "replace", path: `${entry}/address`, value: wanted.email });
  }

  const had = editOf(current).clientStatuses;
  for (const label of had) {
    if (!edit.clientStatuses.includes(label)) operations.push({ op: "remove", path: "/status", match: { label } });
  }
  for (const label of edit.clientStatuses) {
    if (!had.includes(label)) operations.push({ op: "add", path: "/status", value: { "@type": "contactStatus", label } });
  }

  if (edit.authInfo.action === "set") {
    operations.push({ op: "add", path: "/authInfo", value: { "@type": "authInfo", method: "authinfo", authdata: edit.authInfo.value } });
  }
  return operations;
}

const NAMES: Record<string, string> = {
  name: "name",
  organizations: "organisation",
  addresses: "address",
  "addresses/addr": "address",
  "addresses/addr/countryCode": "country",
  "phones/voice": "phone number",
  "phones/voice/number": "phone number",
  "phones/fax": "fax number",
  "phones/fax/number": "fax number",
  "emails/email": "email address",
  "emails/email/address": "email address",
  "name/full": "name",
  "organizations/org": "organisation",
  "organizations/org/name": "organisation",
};

const COMPONENT_NAMES: Record<string, string> = { name: "street line", locality: "city", region: "state or region", postcode: "postal code" };

const valueOf = (value: unknown): string => {
  const entry = record(value);
  if (typeof value === "string") return fromTelUri(value);
  if (typeof entry.value === "string") return entry.value;
  if (typeof entry.full === "string") return entry.full;
  if (typeof entry.address === "string") return entry.address;
  if (typeof entry.number === "string") return fromTelUri(entry.number);
  if (typeof entry.label === "string") return entry.label;
  return "";
};

/** One operation as a line a registrar can read before sending it. The password itself is never part of it. */
export function describeContactOperation(operation: PatchOperation): string {
  if (operation.path === "/authInfo") return "Set the transfer password";
  if (operation.path === "/status") {
    return operation.op === "remove" ? `Remove status ${valueOf(operation.match)}` : `Add status ${valueOf(operation.value)}`;
  }
  let member = operation.path.slice(CARD.length + 1);
  const localized = /^localizations(?:\/[^/]+)?(?:\/(.*))?$/.exec(member);
  if (localized) member = localized[1] ?? "addresses";
  const prefix = localized ? "localized " : "";
  const kind = record("match" in operation ? operation.match : undefined).kind ?? record("value" in operation ? operation.value : undefined).kind;
  const subject = `${prefix}${member === "addresses/addr/components" && typeof kind === "string" ? COMPONENT_NAMES[kind] ?? `address ${kind}` : NAMES[member] ?? member}`;
  if (operation.op === "remove") {
    const old = "match" in operation && operation.match ? valueOf(operation.match) : "";
    return `Remove the ${subject}${old ? ` ${old}` : ""}`;
  }
  const now = operation.op === "add" && (member === "addresses" || (localized !== null && localized[1] === undefined)) ? "" : valueOf(operation.value);
  return operation.op === "add" ? `Add ${subject}${now ? ` ${now}` : ""}` : `Change the ${subject} to ${now}`;
}
