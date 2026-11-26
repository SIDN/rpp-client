export const LOCALES = [
  { id: "en", label: "English" },
  { id: "nl", label: "Nederlands" },
  { id: "de", label: "Deutsch" },
] as const;

export type LocaleId = (typeof LOCALES)[number]["id"];

export const DEFAULT_LOCALE: LocaleId = "en";

export const isLocaleId = (value: unknown): value is LocaleId => LOCALES.some((locale) => locale.id === value);

/** All the text of one language, by key. Plural forms are keys with a `.one` or `.other` suffix. */
export type Messages = Readonly<Record<string, string>>;

export type MessageParams = Readonly<Record<string, string | number>>;
