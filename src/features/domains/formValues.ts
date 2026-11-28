import { t } from "@/i18n";
import type { PeriodInput } from "@/application/domains/domainWorkflows";
import { dnssecEditOf, editOf } from "@/application/domains/domainPatch";
import type { DomainName } from "@/rpp/core/types/objects";
import type { DnssecValues } from "./DnssecFields";
import type { DomainDataValues, PeriodValues } from "./parts";

/** What a new domain can take over from an existing one: its people, name servers and DNSSEC data, but not its name, password or locks. */
export function cloneValuesOf(domain: DomainName): DomainDataValues & DnssecValues {
  const edit = editOf(domain);
  const dnssec = dnssecEditOf(domain);
  return {
    registrant: edit.registrant,
    contacts: edit.contacts,
    nameservers: edit.nameservers.map((host) => ({ host })),
    dsRecords: dnssec.ds as unknown as DnssecValues["dsRecords"],
    keyRecords: dnssec.keys as unknown as DnssecValues["keyRecords"],
    maxSigLife: dnssec.maxSigLife,
  };
}

export interface CloneSource<Values> {
  /** Changes with every clone, so cloning the same object twice resets the form twice. */
  serial: number;
  from: string;
  values: Values;
}

export function periodOf(values: PeriodValues): PeriodInput | undefined {
  const text = values.periodValue.trim();
  return text === "" ? undefined : { value: Number(text), unit: values.periodUnit };
}

const filled = (text: string) => text.trim() !== "";

/** `datetime-local` gives a local time without zone; the protocol takes an RFC 3339 time. */
export function toTimestamp(local: string): string | undefined {
  const date = new Date(local);
  return filled(local) && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
}

export interface RestoreReportValues {
  preData: string;
  postData: string;
  deleteTime: string;
  restoreTime: string;
  restoreReason: string;
  statement1: string;
  statement2: string;
  other: string;
}

type ReportField = keyof RestoreReportValues;

/** What a restore report needs (RFC 3915): every member but `other`, and two statements. */
export function validateReport(values: RestoreReportValues): Partial<Record<ReportField, string>> {
  const errors: Partial<Record<ReportField, string>> = {};
  for (const field of ["preData", "postData", "restoreReason", "statement1", "statement2"] as const) {
    if (!filled(values[field])) errors[field] = t("domains.validation.required");
  }
  for (const field of ["deleteTime", "restoreTime"] as const) {
    if (toTimestamp(values[field]) === undefined) errors[field] = t("domains.validation.dateTime");
  }
  return errors;
}

/** Call only for values that passed `validateReport`. */
export function reportOf(values: RestoreReportValues) {
  return {
    preData: values.preData.trim(),
    postData: values.postData.trim(),
    deleteTime: toTimestamp(values.deleteTime) ?? "",
    restoreTime: toTimestamp(values.restoreTime) ?? "",
    restoreReason: values.restoreReason.trim(),
    statements: [values.statement1.trim(), values.statement2.trim()],
    other: values.other.trim() || undefined,
  };
}

/** Rows left empty are not sent. */
export function domainDataOf(values: DomainDataValues) {
  return {
    registrant: values.registrant.trim() || undefined,
    contacts: values.contacts.filter((contact) => filled(contact.label) && filled(contact.id)).map(({ label, id }) => ({ label: label.trim(), id: id.trim() })),
    nameservers: values.nameservers.map(({ host }) => host.trim()).filter(Boolean),
  };
}
