import { isJsonObject } from "@/rpp/core/types/json";
import type { PatchOperation } from "@/rpp/operations/patch";
import { fromTelUri, toTelUri } from "../contacts/contactCard";

/** The members of a JSContact Card (RFC 9553) that the organisation and user forms edit; the rest of a Card is left alone. */
export interface CardData {
  name: string;
  email: string;
  /** `+CC.number`, with `xEXT` for an extension; empty for none. */
  voice: string;
}

export const EMPTY_CARD_DATA: CardData = { name: "", email: "", voice: "" };

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const record = (value: unknown): Record<string, unknown> => (isJsonObject(value) ? value : {});

export function cardDataOf(card: unknown): CardData {
  const source = record(card);
  return {
    name: text(record(source.name).full),
    email: text(record(record(source.emails).email).address),
    voice: fromTelUri(text(record(record(source.phones).voice).number)),
  };
}

const clean = (data: CardData): CardData => ({ name: data.name.trim(), email: data.email.trim(), voice: data.voice.trim() });

export const hasCardData = (data: CardData): boolean => Object.values(clean(data)).some((value) => value !== "");

/** The Card of a new object: only what was filled in. A phone number that is not `+CC.number` is left out. */
export function cardOf(input: CardData): Record<string, unknown> {
  const data = clean(input);
  const voice = toTelUri(data.voice);
  return {
    "@type": "Card",
    version: "2.0",
    ...(data.name && { name: { full: data.name } }),
    ...(data.email && { emails: { email: { address: data.email } } }),
    ...(voice && { phones: { voice: { number: voice } } }),
  };
}

/**
 * The JSON Patch (json §5.2) that turns the Card at `base` into one with `wanted`: one operation for each member that was
 * added, changed or removed, so the rest of the Card stays as the registry has it.
 */
export function cardPatch(base: string, card: unknown, wanted: CardData): PatchOperation[] {
  const source = record(card);
  const before = clean(cardDataOf(card));
  const now = clean(wanted);
  const operations: PatchOperation[] = [];

  if (now.name !== before.name) {
    if (now.name === "") operations.push({ op: "remove", path: `${base}/name` });
    else if (before.name === "") operations.push({ op: "add", path: `${base}/name`, value: { full: now.name } });
    else operations.push({ op: "replace", path: `${base}/name/full`, value: now.name });
  }

  if (now.email !== before.email) {
    const entry = `${base}/emails/email`;
    if (now.email === "") operations.push({ op: "remove", path: entry });
    else if (before.email === "") {
      operations.push(source.emails === undefined ? { op: "add", path: `${base}/emails`, value: { email: { address: now.email } } } : { op: "add", path: entry, value: { address: now.email } });
    } else operations.push({ op: "replace", path: `${entry}/address`, value: now.email });
  }

  const uri = toTelUri(now.voice);
  if (now.voice !== before.voice && (now.voice === "" || uri !== undefined)) {
    const entry = `${base}/phones/voice`;
    if (uri === undefined) operations.push({ op: "remove", path: entry });
    else if (before.voice === "") {
      operations.push(source.phones === undefined ? { op: "add", path: `${base}/phones`, value: { voice: { number: uri } } } : { op: "add", path: entry, value: { number: uri } });
    } else operations.push({ op: "replace", path: `${entry}/number`, value: uri });
  }
  return operations;
}
