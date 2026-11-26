import { DEFAULT_LOCALE, isLocaleId, type LocaleId, type MessageParams, type Messages } from "./types";
import { de } from "./locales/de";
import { en } from "./locales/en";
import { nl } from "./locales/nl";

export { DEFAULT_LOCALE, LOCALES, isLocaleId, type LocaleId, type MessageParams, type Messages } from "./types";

const CATALOGS: Record<LocaleId, Messages> = { en, nl, de };

const STORAGE_KEY = "rpp-client.locale";

type Listener = () => void;
const listeners = new Set<Listener>();
let current: LocaleId | undefined;

function readStored(): LocaleId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocaleId(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function getLocale(): LocaleId {
  current ??= readStored();
  return current;
}

/** Changes the language of the client and keeps the choice in this browser (a preference, nothing secret). */
export function setLocale(id: LocaleId): void {
  if (!isLocaleId(id)) return;
  current = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // The choice still holds for this page view.
  }
  if (typeof document !== "undefined") document.documentElement.lang = id;
  listeners.forEach((listener) => listener());
}

export function subscribeToLocale(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Sets the `lang` of the page to the stored language; called once before the first render. */
export function initLocale(): void {
  document.documentElement.lang = getLocale();
}

function pluralKey(locale: LocaleId, key: string, count: number, catalog: Messages): string | undefined {
  const form = new Intl.PluralRules(locale).select(count);
  return [`${key}.${form}`, `${key}.other`].find((candidate) => candidate in catalog);
}

function fill(template: string, params: MessageParams | undefined): string {
  return params ? template.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in params ? String(params[name]) : placeholder)) : template;
}

/** The text for `key` in `locale`: its own text, else the English text, else the key itself so a gap is visible. */
export function translate(locale: LocaleId, key: string, params?: MessageParams): string {
  for (const id of locale === DEFAULT_LOCALE ? [DEFAULT_LOCALE] : [locale, DEFAULT_LOCALE]) {
    const catalog = CATALOGS[id];
    const resolved = typeof params?.count === "number" ? (pluralKey(id, key, params.count, catalog) ?? key) : key;
    const template = catalog[resolved];
    if (template !== undefined) return fill(template, params);
  }
  return key;
}

/**
 * The text for `key` in the language the person chose. Placeholders are written `{name}`. With a numeric `count`
 * parameter the plural form `key.one`, `key.other` and so on is used. The client remounts its screens when the language
 * changes, so this can be called at render time anywhere; do not call it at module load.
 */
export const t = (key: string, params?: MessageParams): string => translate(getLocale(), key, params);
