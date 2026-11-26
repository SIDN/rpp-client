// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { de } from "./locales/de";
import { en } from "./locales/en";
import { nl } from "./locales/nl";
import { getLocale, setLocale, t, translate } from ".";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("locale files", () => {
  it.each([
    ["nl", nl],
    ["de", de],
  ])("%s has exactly the keys and placeholders of English", (_id, messages) => {
    expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(en)) {
      expect(placeholders(messages[key]), key).toEqual(placeholders(text));
    }
  });
});

describe("translate", () => {
  afterEach(() => {
    localStorage.clear();
    setLocale("en");
  });

  it("falls back to the key for unknown keys", () => {
    expect(translate("nl", "no.such.key")).toBe("no.such.key");
  });

  it("uses the chosen language and persists it", () => {
    setLocale("de");
    expect(getLocale()).toBe("de");
    expect(localStorage.getItem("rpp-client.locale")).toBe("de");
    expect(t("client.language.label")).toBe(de["client.language.label"]);
    expect(document.documentElement.lang).toBe("de");
  });
});
