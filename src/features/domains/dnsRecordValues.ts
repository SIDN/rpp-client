import type { DnsRecordInput, EditableRecordType } from "@/application/domains/dnsRecords";

/** One row of the form: `value` holds the name server, the address or the mail server, by type. */
export interface DnsRecordRow {
  type: EditableRecordType;
  name: string;
  value: string;
  preference: string;
}

export interface DnsRecordValues {
  dnsRecords: DnsRecordRow[];
}

export const DNS_RECORD_DEFAULTS: DnsRecordValues = { dnsRecords: [] };

export const isFilled = (row: DnsRecordRow) => row.value.trim() !== "" || (row.type === "mx" && row.preference.trim() !== "");

export function recordInputOf(row: DnsRecordRow): DnsRecordInput {
  switch (row.type) {
    case "ns":
      return { type: "ns", name: row.name, nsdname: row.value };
    case "a":
    case "aaaa":
      return { type: row.type, name: row.name, address: row.value };
    case "mx":
      return { type: "mx", name: row.name, preference: row.preference, exchange: row.value };
  }
}

export function recordRowOf(input: DnsRecordInput): DnsRecordRow {
  switch (input.type) {
    case "ns":
      return { type: "ns", name: input.name, value: input.nsdname, preference: "" };
    case "a":
    case "aaaa":
      return { type: input.type, name: input.name, value: input.address, preference: "" };
    case "mx":
      return { type: "mx", name: input.name, value: input.exchange, preference: input.preference };
  }
}

/** Rows whose data was left empty are not sent. */
export const recordInputsOf = (rows: readonly DnsRecordRow[]): DnsRecordInput[] => rows.filter(isFilled).map(recordInputOf);
