import type { RppTransport } from "@/rpp/client/RppTransport";
import { t } from "@/i18n";
import { loadPresetSchema } from "@/rpp/schemas/presetSchemaLoader";
import { createSchemaRegistry, type PresetSchemaKey, type SchemaRegistry } from "@/rpp/schemas/SchemaRegistry";
import { issueTarget, type ValidationIssue } from "@/rpp/schemas/validation";
import type { PostalMode } from "./contactCard";

/** What the Preset Schema of a preset lets a contact carry, as far as the contact forms are concerned. */
export interface ContactSupport {
  /** The Card's own `name`, `organizations` and `addresses`: the international (`int`) postal info. */
  card: boolean;
  /** `localizations` with a name and an address: the localized (`loc`) postal info. */
  localized: boolean;
  /** The transfer password of the contact. */
  authInfo: boolean;
}

export type ContactSupportResult = { kind: "known"; support: ContactSupport } | { kind: "unknown"; reason: string };

const DEFINITION = "contact.create";
const ADDRESS = { addr: { countryCode: "NL", components: [{ kind: "name", value: "Probe street 1" }, { kind: "locality", value: "Arnhem" }] } };
const EMAIL = { email: { address: "probe@example.test" } };

const contactWith = (members: Record<string, unknown>) => ({
  "@type": "contact",
  id: "PROBE-1",
  contactInfo: { "@type": "Card", version: "2.0", emails: EMAIL, ...members },
});

const PROBES = {
  card: { value: contactWith({ name: { full: "Probe" }, addresses: ADDRESS }), members: ["/contactInfo/name", "/contactInfo/addresses"] },
  localized: { value: contactWith({ localizations: { und: { name: { full: "Probe" }, addresses: ADDRESS } } }), members: ["/contactInfo/localizations"] },
  authInfo: { value: { ...contactWith({}), authInfo: { "@type": "authInfo", method: "authinfo", authdata: "probe" } }, members: ["/authInfo"] },
} as const;

const concerns = (issue: ValidationIssue, members: readonly string[]) => {
  const target = issueTarget(issue);
  return members.some((member) => target === member || target.startsWith(`${member}/`));
};

/**
 * Whether the schema takes each form of the contact, found by validating a sample that has only that form against
 * `contact.create`. A form is refused when an issue is about the members of the sample that make it up, so what else the
 * schema requires (an identifier, other members) does not count. Undefined when the schema has no such definition.
 */
export function probeContactSupport(registry: SchemaRegistry, preset: PresetSchemaKey): ContactSupport | undefined {
  const takes = (probe: (typeof PROBES)[keyof typeof PROBES]) => {
    const result = registry.validate(preset, DEFINITION, probe.value);
    if (result.status === "unavailable") return undefined;
    return result.status === "valid" || !result.issues.some((issue) => concerns(issue, probe.members));
  };
  const card = takes(PROBES.card);
  const localized = takes(PROBES.localized);
  const authInfo = takes(PROBES.authInfo);
  if (card === undefined || localized === undefined || authInfo === undefined) return undefined;
  return { card, localized, authInfo };
}

/** Where the registry keeps the postal info that the schema allows. Without either form nothing is known, so both are offered. */
export function postalModeOf(support: Pick<ContactSupport, "card" | "localized">): PostalMode {
  if (support.card && !support.localized) return "card-only";
  if (support.localized && !support.card) return "localized-only";
  return "both";
}

/** Loads the Preset Schema of the preset and reads from it what a contact may carry. A failure is a result, not a throw. */
export async function readContactSupport(transport: RppTransport, preset: PresetSchemaKey, signal?: AbortSignal): Promise<ContactSupportResult> {
  const registry = createSchemaRegistry();
  try {
    await loadPresetSchema({ transport, registry, preset, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    return { kind: "unknown", reason: error instanceof Error ? error.message : String(error) };
  }
  const support = probeContactSupport(registry, preset);
  return support
    ? { kind: "known", support }
    : { kind: "unknown", reason: t("contacts.form.schemaDefinitionMissing", { preset: preset.id, definition: DEFINITION }) };
}
