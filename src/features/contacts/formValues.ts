import type { DeepPartial, FieldErrors } from "react-hook-form";
import { EMPTY_CONTACT, STREET_LINES, type AddressData, type AddressType, type ContactData } from "@/application/contacts/contactCard";

/** An address as form fields: a form field holds one string, so the street lines are fields of their own. */
export interface AddressValues {
  street1: string;
  street2: string;
  street3: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
}

/** The contact form's values. Both addresses are kept; `addressType` says which of them the form shows. */
export interface ContactValues extends Omit<ContactData, "address" | "localAddress"> {
  addressType: AddressType;
  address: AddressValues;
  localAddress: AddressValues;
}

export const STREET_FIELDS = ["street1", "street2", "street3"] as const;

export function toAddressValues(address: AddressData): AddressValues {
  return { street1: address.street[0] ?? "", street2: address.street[1] ?? "", street3: address.street[2] ?? "", city: address.city, region: address.region, postcode: address.postcode, country: address.country };
}

export function toAddressData(values: Partial<AddressValues> | undefined): AddressData {
  return {
    street: STREET_FIELDS.slice(0, STREET_LINES).map((field) => values?.[field] ?? ""),
    city: values?.city ?? "",
    region: values?.region ?? "",
    postcode: values?.postcode ?? "",
    country: values?.country ?? "",
  };
}

export function toValues(data: ContactData, addressType: AddressType = "int"): ContactValues {
  return { ...data, addressType, address: toAddressValues(data.address), localAddress: toAddressValues(data.localAddress) };
}

export function toData(values: DeepPartial<ContactValues>): ContactData {
  return {
    kind: values.kind ?? "",
    name: values.name ?? "",
    organisation: values.organisation ?? "",
    address: toAddressData(values.address),
    localAddress: toAddressData(values.localAddress),
    voice: values.voice ?? "",
    fax: values.fax ?? "",
    email: values.email ?? "",
  };
}

export const EMPTY_VALUES: ContactValues = toValues(EMPTY_CONTACT);

/** The address form a submit that failed has to show, because the error is in a field that is not on view. */
export function addressTypeOfErrors(errors: FieldErrors<ContactValues>): AddressType | undefined {
  if (errors.address) return "int";
  if (errors.localAddress) return "loc";
  return undefined;
}
