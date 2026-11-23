import { JSON_SCHEMA_2020_12 } from "@/rpp/schemas/SchemaRegistry";

/** The profiles the fixture knows. `localized-only` is the SIDN EPP compatibility profile as the proxy publishes it, trimmed. */
export type ContactProfileFixture = "none" | "localized-only" | "card-only";

const BASE = {
  type: "object",
  properties: {
    "@type": { const: "contact" },
    id: { type: "string" },
    contactInfo: { $ref: "#/$defs/Card" },
    authInfo: {},
  },
  required: ["@type", "id", "contactInfo"],
};

const CARD = {
  type: "object",
  properties: { "@type": {}, version: {}, kind: {}, name: {}, organizations: {}, addresses: {}, phones: {}, emails: {}, localizations: {} },
  required: ["@type", "version"],
};

const LOCALIZED_ONLY = {
  "profile.contact": { properties: { contactInfo: { $ref: "#/$defs/profile.card" }, authInfo: false } },
  "profile.card": {
    required: ["localizations", "emails"],
    properties: {
      name: false,
      organizations: false,
      addresses: false,
      localizations: {
        minProperties: 1,
        maxProperties: 1,
        additionalProperties: {
          required: ["name", "addresses"],
          properties: {
            name: { required: ["full"] },
            addresses: { required: ["addr"], additionalProperties: { required: ["countryCode", "components"] } },
            emails: false,
          },
        },
      },
    },
  },
};

const CARD_ONLY = {
  "profile.contact": { properties: { contactInfo: { $ref: "#/$defs/profile.card" } } },
  "profile.card": { required: ["name", "addresses"], properties: { localizations: false } },
};

const PROFILES = { none: undefined, "localized-only": LOCALIZED_ONLY, "card-only": CARD_ONLY } as const;

/** The Preset Schema of a preset whose `contact.create` is constrained by the profile, composed as the proxy does. */
export function contactPresetSchema(preset: { id: string; version: string }, profile: ContactProfileFixture = "none"): Record<string, unknown> {
  const constraints = PROFILES[profile];
  return {
    $schema: JSON_SCHEMA_2020_12,
    "rpp:preset": preset,
    $defs: {
      Card: CARD,
      "contact.create": constraints ? { allOf: [BASE, { $ref: "#/$defs/profile.contact" }] } : BASE,
      ...constraints,
    },
  };
}
