import { describe, expect, it } from "vitest";
import type { Contact } from "@/rpp/core/types/objects";
import { buildContactPatch, cardOf, dataOf, describeContactOperation, EMPTY_ADDRESS, EMPTY_CONTACT, editOf, fromTelUri, localizationKeyOf, postalModeOfContact, toTelUri, type AddressData, type ContactEdit } from "./contactCard";

const contact = (info: Record<string, unknown>, status = [{ "@type": "contactStatus", label: "ok" }]): Contact =>
  ({ "@type": "contact", id: "C-1", provMetadata: { "@type": "provMetadata", spClientId: "REG" }, status, contactInfo: info }) as unknown as Contact;

const address = (change: Partial<AddressData> = {}): AddressData => ({ ...EMPTY_ADDRESS, ...change });

const FULL = contact({
  "@type": "Card",
  version: "2.0",
  kind: "individual",
  name: { full: "John Doe" },
  organizations: { org: { name: "Example Inc." } },
  addresses: {
    addr: {
      components: [
        { kind: "name", value: "123 Main St" },
        { kind: "locality", value: "Reston" },
        { kind: "region", value: "VA" },
        { kind: "postcode", value: "20190" },
      ],
      countryCode: "US",
    },
  },
  phones: { voice: { number: "tel:+1.7035555555;ext=12" }, fax: { number: "tel:+1.7035555556", features: { fax: true } } },
  emails: { email: { address: "jdoe@example.test" } },
});

const WITH_LOCALIZATION = contact({
  ...(FULL.contactInfo as Record<string, unknown>),
  localizations: { und: { addresses: { addr: { components: [{ kind: "name", value: "Hauptstraße 1" }, { kind: "locality", value: "München" }], countryCode: "DE" } } } },
});

describe("phone numbers", () => {
  it("are told as a telephone URI and back", () => {
    expect(toTelUri("+31.201234567")).toBe("tel:+31.201234567");
    expect(toTelUri(" +1.7035555555x12 ")).toBe("tel:+1.7035555555;ext=12");
    expect(fromTelUri("tel:+1.7035555555;ext=12")).toBe("+1.7035555555x12");
    expect(fromTelUri("tel:+31.2")).toBe("+31.2");
    expect(fromTelUri("something else")).toBe("something else");
  });

  it("are refused unless they have the form +CC.number", () => {
    for (const bad of ["", "0201234567", "+31201234567", "+31.20 123", "+1234.5", "+31.123456789012345", "tel:+31.2"]) {
      expect(toTelUri(bad)).toBeUndefined();
    }
  });
});

describe("contact data", () => {
  it("reads the members of the Card the forms edit, the international address and the localized one", () => {
    expect(dataOf(FULL)).toEqual({
      kind: "individual",
      name: "John Doe",
      organisation: "Example Inc.",
      address: { street: ["123 Main St", "", ""], city: "Reston", region: "VA", postcode: "20190", country: "US" },
      localAddress: EMPTY_ADDRESS,
      voice: "+1.7035555555x12",
      fax: "+1.7035555556",
      email: "jdoe@example.test",
    });
    expect(dataOf(WITH_LOCALIZATION).localAddress).toEqual({ street: ["Hauptstraße 1", "", ""], city: "München", region: "", postcode: "", country: "DE" });
    expect(localizationKeyOf(FULL)).toBe("und");
  });

  it("reads a bare Card without failing", () => {
    expect(dataOf(contact({}))).toEqual(EMPTY_CONTACT);
    expect(dataOf(contact({ name: "x", addresses: { addr: { components: "no" } }, localizations: "no" }))).toEqual(EMPTY_CONTACT);
  });

  it("builds the Card of a new contact from what was filled in, the localized address in the localization", () => {
    expect(cardOf(EMPTY_CONTACT)).toEqual({ "@type": "Card", version: "2.0" });
    expect(
      cardOf({
        ...EMPTY_CONTACT,
        kind: "org",
        name: " Jane ",
        organisation: "ACME",
        address: address({ street: ["Main St 1", "", "Floor 2"], city: "Utrecht", country: "NL" }),
        localAddress: address({ street: ["Hoofdstraat 1", "", ""], city: "Zürich", country: "CH" }),
        voice: "+31.201234567",
        fax: "+31.201234568",
        email: "j@example.test",
      }),
    ).toEqual({
      "@type": "Card",
      version: "2.0",
      kind: "org",
      name: { full: "Jane" },
      organizations: { org: { name: "ACME" } },
      addresses: { addr: { components: [{ kind: "name", value: "Main St 1" }, { kind: "name", value: "Floor 2" }, { kind: "locality", value: "Utrecht" }], countryCode: "NL" } },
      phones: { voice: { number: "tel:+31.201234567" }, fax: { number: "tel:+31.201234568", features: { fax: true } } },
      emails: { email: { address: "j@example.test" } },
      localizations: { und: { addresses: { addr: { components: [{ kind: "name", value: "Hoofdstraat 1" }, { kind: "locality", value: "Zürich" }], countryCode: "CH" } } } },
    });
  });

  it("reads back what it builds", () => {
    const data = { ...EMPTY_CONTACT, kind: "individual" as const, name: "A", address: address({ street: ["S", "", ""], city: "C", country: "NL" }), localAddress: address({ street: ["Ü", "", ""], city: "D", country: "DE" }), voice: "+31.2", email: "a@b.test" };
    expect(dataOf(contact(cardOf(data)))).toEqual(data);
  });
});

describe("contact patch", () => {
  const edit = (change: Partial<ContactEdit> = {}): ContactEdit => ({ ...editOf(FULL), ...change });

  it("asks for nothing when nothing was edited", () => {
    expect(buildContactPatch(FULL, edit())).toEqual([]);
    expect(buildContactPatch(WITH_LOCALIZATION, editOf(WITH_LOCALIZATION))).toEqual([]);
  });

  it("replaces, adds and removes the name, the organisation and the email", () => {
    expect(buildContactPatch(FULL, edit({ name: "Jane Doe", organisation: "ACME", email: "j@example.test" }))).toEqual([
      { op: "replace", path: "/contactInfo/name/full", value: "Jane Doe" },
      { op: "replace", path: "/contactInfo/organizations/org/name", value: "ACME" },
      { op: "replace", path: "/contactInfo/emails/email/address", value: "j@example.test" },
    ]);
    expect(buildContactPatch(FULL, edit({ name: "", organisation: "", email: "" }))).toEqual([
      { op: "remove", path: "/contactInfo/name" },
      { op: "remove", path: "/contactInfo/organizations/org" },
      { op: "remove", path: "/contactInfo/emails/email" },
    ]);
    const bare = contact({ "@type": "Card", version: "2.0" });
    expect(buildContactPatch(bare, { ...editOf(bare), name: "A", organisation: "B", email: "c@d.test" })).toEqual([
      { op: "add", path: "/contactInfo/name", value: { full: "A" } },
      { op: "add", path: "/contactInfo/organizations", value: { org: { name: "B" } } },
      { op: "add", path: "/contactInfo/emails/email", value: { address: "c@d.test" } },
    ]);
  });

  it("changes address components one by one", () => {
    expect(buildContactPatch(FULL, edit({ address: address({ street: ["Hinterhaus", "", ""], city: "Offenbach", region: "", postcode: "20191", country: "CA" }) }))).toEqual([
      { op: "remove", path: "/contactInfo/addresses/addr/components", match: { kind: "name", value: "123 Main St" } },
      { op: "add", path: "/contactInfo/addresses/addr/components", value: { kind: "name", value: "Hinterhaus" } },
      { op: "replace", path: "/contactInfo/addresses/addr/components", match: { kind: "locality" }, value: { kind: "locality", value: "Offenbach" } },
      { op: "remove", path: "/contactInfo/addresses/addr/components", match: { kind: "region" } },
      { op: "replace", path: "/contactInfo/addresses/addr/components", match: { kind: "postcode" }, value: { kind: "postcode", value: "20191" } },
      { op: "replace", path: "/contactInfo/addresses/addr/countryCode", value: "CA" },
    ]);
  });

  it("adds a whole address to a contact without one, and removes it", () => {
    const bare = contact({ "@type": "Card", version: "2.0" });
    expect(buildContactPatch(bare, { ...editOf(bare), address: address({ street: ["Main St 1", "", ""], city: "Utrecht", country: "NL" }) })).toEqual([
      { op: "add", path: "/contactInfo/addresses", value: { addr: { components: [{ kind: "name", value: "Main St 1" }, { kind: "locality", value: "Utrecht" }], countryCode: "NL" } } },
    ]);
    expect(buildContactPatch(FULL, edit({ address: EMPTY_ADDRESS }))).toEqual([{ op: "remove", path: "/contactInfo/addresses/addr" }]);
  });

  it("changes the localized address in the localization, and adds one to a contact that has none", () => {
    expect(buildContactPatch(WITH_LOCALIZATION, { ...editOf(WITH_LOCALIZATION), localAddress: address({ street: ["Hauptstraße 1", "", ""], city: "Köln", country: "DE" }) })).toEqual([
      { op: "replace", path: "/contactInfo/localizations/und/addresses/addr/components", match: { kind: "locality" }, value: { kind: "locality", value: "Köln" } },
    ]);
    expect(buildContactPatch(WITH_LOCALIZATION, { ...editOf(WITH_LOCALIZATION), localAddress: EMPTY_ADDRESS })).toEqual([
      { op: "remove", path: "/contactInfo/localizations/und/addresses" },
    ]);
    const whole = address({ street: ["Hauptstraße 1", "", ""], city: "Köln", country: "DE" });
    const expected = { addr: { components: [{ kind: "name", value: "Hauptstraße 1" }, { kind: "locality", value: "Köln" }], countryCode: "DE" } };
    expect(buildContactPatch(FULL, edit({ localAddress: whole }))).toEqual([{ op: "add", path: "/contactInfo/localizations", value: { und: { addresses: expected } } }]);
    const named = contact({ ...(FULL.contactInfo as Record<string, unknown>), localizations: { de: { name: { full: "Jörg" } } } });
    expect(localizationKeyOf(named)).toBe("de");
    expect(buildContactPatch(named, { ...editOf(named), localAddress: whole })).toEqual([{ op: "add", path: "/contactInfo/localizations/de/addresses", value: expected }]);
  });

  it("sets phone numbers as telephone URIs, with the fax feature on a new fax", () => {
    expect(buildContactPatch(FULL, edit({ voice: "+31.201234567", fax: "" }))).toEqual([
      { op: "replace", path: "/contactInfo/phones/voice/number", value: "tel:+31.201234567" },
      { op: "remove", path: "/contactInfo/phones/fax" },
    ]);
    const bare = contact({ "@type": "Card", version: "2.0" });
    expect(buildContactPatch(bare, { ...editOf(bare), voice: "+31.2", fax: "+31.3" })).toEqual([
      { op: "add", path: "/contactInfo/phones/voice", value: { number: "tel:+31.2" } },
      { op: "add", path: "/contactInfo/phones/fax", value: { number: "tel:+31.3", features: { fax: true } } },
    ]);
  });

  it("leaves out a number that is not valid, for the form to flag", () => {
    expect(buildContactPatch(FULL, edit({ voice: "0201234567" }))).toEqual([]);
  });

  it("changes client statuses only, and sets the transfer password", () => {
    const operations = buildContactPatch(FULL, edit({ clientStatuses: ["clientDeleteProhibited"], authInfo: { action: "set", value: "pw" } }));
    expect(operations).toEqual([
      { op: "add", path: "/status", value: { "@type": "contactStatus", label: "clientDeleteProhibited" } },
      { op: "add", path: "/authInfo", value: { "@type": "authInfo", method: "authinfo", authdata: "pw" } },
    ]);
    expect(operations.map(describeContactOperation).join()).not.toContain("pw");
  });

  it("describes each operation in words", () => {
    const lines = buildContactPatch(FULL, edit({ name: "Jane", address: address({ street: ["Hinterhaus", "", ""], city: "", region: "VA", postcode: "20190", country: "US" }), voice: "+31.2", email: "" })).map(describeContactOperation);
    expect(lines).toEqual([
      "Change the name to Jane",
      "Remove the street line 123 Main St",
      "Add street line Hinterhaus",
      "Remove the city",
      "Change the phone number to +31.2",
      "Remove the email address",
    ]);
    const localized = buildContactPatch(WITH_LOCALIZATION, { ...editOf(WITH_LOCALIZATION), localAddress: address({ street: ["Neu 2", "", ""], city: "München", country: "DE" }) }).map(describeContactOperation);
    expect(localized).toEqual(["Remove the localized street line Hauptstraße 1", "Add localized street line Neu 2"]);
    expect(buildContactPatch(FULL, edit({ localAddress: address({ city: "X", country: "DE" }) })).map(describeContactOperation)).toEqual(["Add localized address"]);
    expect(buildContactPatch(WITH_LOCALIZATION, { ...editOf(WITH_LOCALIZATION), localAddress: EMPTY_ADDRESS }).map(describeContactOperation)).toEqual(["Remove the localized address"]);
  });
});

describe("postal info kept in the localization only", () => {
  const data = {
    ...EMPTY_CONTACT,
    name: "Jan Jansen",
    organisation: "Voorbeeld BV",
    localAddress: address({ street: ["Dorpsstraat 1", "", ""], city: "Arnhem", country: "NL" }),
    email: "jan@example.test",
  };

  it("recognises a card that has its postal info only in the localization", () => {
    const card = contact({ "@type": "Card", version: "2.0", localizations: { und: { name: { full: "Jan" } } } });
    expect(postalModeOfContact(card)).toBe("localized-only");
    expect(postalModeOfContact(FULL)).toBe("both");
  });

  it("writes name, organisation and address in the localization and none of them in the card", () => {
    const card = cardOf(data, "localized-only");
    expect(card).not.toHaveProperty("name");
    expect(card).not.toHaveProperty("organizations");
    expect(card).not.toHaveProperty("addresses");
    expect(card).toMatchObject({
      localizations: {
        und: {
          name: { full: "Jan Jansen" },
          organizations: { org: { name: "Voorbeeld BV" } },
          addresses: { addr: { components: [{ kind: "name", value: "Dorpsstraat 1" }, { kind: "locality", value: "Arnhem" }], countryCode: "NL" } },
        },
      },
      emails: { email: { address: "jan@example.test" } },
    });
  });

  it("reads them back from the localization and patches them there", () => {
    const current = contact(cardOf(data, "localized-only"));
    const read = dataOf(current, "localized-only");
    expect(read).toMatchObject({ name: "Jan Jansen", organisation: "Voorbeeld BV", localAddress: { city: "Arnhem", country: "NL" } });
    const operations = buildContactPatch(current, { ...editOf(current, "localized-only"), name: "Piet", localAddress: { ...read.localAddress, city: "Zwolle" } }, "localized-only");
    expect(operations).toEqual([
      { op: "replace", path: "/contactInfo/localizations/und/name/full", value: "Piet" },
      { op: "replace", path: "/contactInfo/localizations/und/addresses/addr/components", match: { kind: "locality" }, value: { kind: "locality", value: "Zwolle" } },
    ]);
    expect(operations.map(describeContactOperation)).toEqual(["Change the localized name to Piet", "Change the localized city to Zwolle"]);
  });
});

describe("postal info kept in the card only", () => {
  const data = {
    ...EMPTY_CONTACT,
    name: "Jan Jansen",
    address: address({ street: ["Main St 1", "", ""], city: "Arnhem", country: "NL" }),
    localAddress: address({ street: ["Dorpsstraat 1", "", ""], city: "Zürich", country: "CH" }),
  };

  it("leaves the localized address out of the card, whatever the form holds", () => {
    const card = cardOf(data, "card-only");
    expect(card).not.toHaveProperty("localizations");
    expect(card).toMatchObject({ name: { full: "Jan Jansen" }, addresses: { addr: { countryCode: "NL" } } });
  });

  it("reads no localized address and patches none", () => {
    const current = WITH_LOCALIZATION;
    expect(dataOf(current, "card-only").localAddress).toEqual(EMPTY_ADDRESS);
    const operations = buildContactPatch(current, { ...editOf(current, "card-only"), address: address({ street: ["123 Main St", "", ""], city: "Reston", region: "VA", postcode: "20190", country: "CA" }) }, "card-only");
    expect(operations).toEqual([{ op: "replace", path: "/contactInfo/addresses/addr/countryCode", value: "CA" }]);
  });
});
