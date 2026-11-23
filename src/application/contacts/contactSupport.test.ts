import { describe, expect, it } from "vitest";
import { createSchemaRegistry } from "@/rpp/schemas/SchemaRegistry";
import { contactPresetSchema, type ContactProfileFixture } from "@/test/contactPresetSchemas";
import { postalModeOf, probeContactSupport } from "./contactSupport";

const PRESET = { id: "urn:test:preset", version: "1.0" };

const probe = (profile: ContactProfileFixture) => {
  const registry = createSchemaRegistry();
  registry.addPresetSchema(contactPresetSchema(PRESET, profile), PRESET);
  return probeContactSupport(registry, PRESET);
};

describe("what the Preset Schema lets a contact carry", () => {
  it("allows every form when the schema constrains none", () => {
    expect(probe("none")).toEqual({ card: true, localized: true, authInfo: true });
  });

  it("allows only the localized form, and no transfer password, when the profile forbids the Card's own members", () => {
    expect(probe("localized-only")).toEqual({ card: false, localized: true, authInfo: false });
  });

  it("allows only the international form when the profile forbids localizations", () => {
    expect(probe("card-only")).toEqual({ card: true, localized: false, authInfo: true });
  });

  it("knows nothing when the schema has no contact.create", () => {
    const registry = createSchemaRegistry();
    registry.addPresetSchema({ ...contactPresetSchema(PRESET), $defs: { other: {} } }, PRESET);
    expect(probeContactSupport(registry, PRESET)).toBeUndefined();
  });
});

describe("where the postal info is kept", () => {
  it("follows the forms the schema allows", () => {
    expect(postalModeOf({ card: true, localized: true })).toBe("both");
    expect(postalModeOf({ card: true, localized: false })).toBe("card-only");
    expect(postalModeOf({ card: false, localized: true })).toBe("localized-only");
  });

  it("offers both when the schema allows neither, so that the server decides", () => {
    expect(postalModeOf({ card: false, localized: false })).toBe("both");
  });
});
