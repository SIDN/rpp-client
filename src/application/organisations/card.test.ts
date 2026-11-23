import { describe, expect, it } from "vitest";
import { cardDataOf, cardOf, cardPatch, hasCardData } from "./card";

const FULL = {
  "@type": "Card",
  version: "2.0",
  name: { full: "Jane Doe" },
  emails: { email: { address: "jane@example.test" } },
  phones: { voice: { number: "tel:+31.201234567;ext=12" } },
  kind: "individual",
};
const data = (overrides: Partial<ReturnType<typeof cardDataOf>> = {}) => ({ ...cardDataOf(FULL), ...overrides });

describe("cardDataOf", () => {
  it("reads the name, the email address and the phone number", () => {
    expect(cardDataOf(FULL)).toEqual({ name: "Jane Doe", email: "jane@example.test", voice: "+31.201234567x12" });
  });

  it("reads nothing from what is not a Card", () => {
    expect(cardDataOf(undefined)).toEqual({ name: "", email: "", voice: "" });
    expect(cardDataOf("x")).toEqual({ name: "", email: "", voice: "" });
  });
});

describe("cardOf", () => {
  it("holds only what was filled in", () => {
    expect(cardOf({ name: " Jane ", email: "", voice: "" })).toEqual({ "@type": "Card", version: "2.0", name: { full: "Jane" } });
    expect(cardOf({ name: "Jane", email: "j@example.test", voice: "+31.201234567x12" })).toEqual({
      "@type": "Card",
      version: "2.0",
      name: { full: "Jane" },
      emails: { email: { address: "j@example.test" } },
      phones: { voice: { number: "tel:+31.201234567;ext=12" } },
    });
  });

  it("leaves out a phone number that is not +CC.number", () => {
    expect(cardOf({ name: "", email: "", voice: "0201234567" })).toEqual({ "@type": "Card", version: "2.0" });
  });

  it("knows whether anything was filled in", () => {
    expect(hasCardData({ name: " ", email: "", voice: "" })).toBe(false);
    expect(hasCardData({ name: "", email: "a@b.test", voice: "" })).toBe(true);
  });
});

describe("cardPatch", () => {
  it("has no operations when nothing changed", () => {
    expect(cardPatch("/details", FULL, data())).toEqual([]);
  });

  it("replaces what changed, below the Card", () => {
    expect(cardPatch("/details", FULL, data({ name: "Janet", email: "j@example.test", voice: "+31.207654321" }))).toEqual([
      { op: "replace", path: "/details/name/full", value: "Janet" },
      { op: "replace", path: "/details/emails/email/address", value: "j@example.test" },
      { op: "replace", path: "/details/phones/voice/number", value: "tel:+31.207654321" },
    ]);
  });

  it("removes what was emptied", () => {
    expect(cardPatch("/contactInfo", FULL, data({ name: "", email: "", voice: "" }))).toEqual([
      { op: "remove", path: "/contactInfo/name" },
      { op: "remove", path: "/contactInfo/emails/email" },
      { op: "remove", path: "/contactInfo/phones/voice" },
    ]);
  });

  it("adds what is new, with its parent member when the Card has none", () => {
    const bare = { "@type": "Card", version: "2.0" };
    expect(cardPatch("/details", bare, { name: "Jane", email: "j@example.test", voice: "+31.201234567" })).toEqual([
      { op: "add", path: "/details/name", value: { full: "Jane" } },
      { op: "add", path: "/details/emails", value: { email: { address: "j@example.test" } } },
      { op: "add", path: "/details/phones", value: { voice: { number: "tel:+31.201234567" } } },
    ]);
    const withEmails = { ...bare, emails: { work: { address: "w@example.test" } }, phones: { fax: { number: "tel:+31.2" } } };
    expect(cardPatch("/details", withEmails, { name: "", email: "j@example.test", voice: "+31.201234567" })).toEqual([
      { op: "add", path: "/details/emails/email", value: { address: "j@example.test" } },
      { op: "add", path: "/details/phones/voice", value: { number: "tel:+31.201234567" } },
    ]);
  });

  it("does not send a phone number that is not +CC.number", () => {
    expect(cardPatch("/details", FULL, data({ voice: "0201234567" }))).toEqual([]);
  });
});
