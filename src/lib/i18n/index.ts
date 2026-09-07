/**
 * Two languages, Khmer first.
 *
 * The people using this app all day are Cambodian sales reps standing in
 * Cambodian shops. English was never the right default here; it was the
 * default because that is the language this was built in.
 *
 * KHMER IS THE DEFAULT AND ENGLISH IS THE FALLBACK, in that order. A key with
 * no Khmer yet falls through to English rather than showing a raw key or a
 * blank, so a half-translated app is a working app in two languages rather
 * than a broken one in neither.
 *
 * THE ENGLISH DICTIONARY IS THE SHAPE. Every other language is typed against
 * it, so a key added in English and forgotten elsewhere is a compile error
 * rather than something a rep finds in a shop.
 */

import { en } from "./en";
import { km } from "./km";

export type Lang = "km" | "en";

export const LANGS: Lang[] = ["km", "en"];

/** Khmer, because that is who the app is for. */
export const DEFAULT_LANG: Lang = "km";

/**
 * The choice lives in a cookie, not in localStorage.
 *
 * Storage cannot be read on the server, so a page rendered there would always
 * be in the default language and then flip once the browser corrected it —
 * every translated string a hydration mismatch, and React throwing the tree
 * away and drawing it again. A cookie is sent with the request, so the server
 * renders the right language the first time and there is nothing to correct.
 *
 * Not httpOnly: the switcher sets it from the browser, and nothing here is a
 * secret. A year, because this is not a decision anybody makes twice.
 */
export const LANG_COOKIE = "hig-lang";
const LANG_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** What each language calls itself. Never translated — that is the point. */
export const LANG_NAME: Record<Lang, string> = {
  km: "ភាសាខ្មែរ",
  en: "English",
};

export type Dict = typeof en;
export type MessageKey = keyof Dict;

/** Khmer may be incomplete; English may not. */
type Messages = Partial<Record<MessageKey, string>>;

const DICTS: Record<Lang, Messages> = { en, km };

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as string[]).includes(value);
}

/**
 * One message, with `{name}` placeholders filled in.
 *
 * Placeholders rather than concatenation, because word order is not the same
 * in the two languages and a sentence assembled from fragments can only be
 * right in one of them.
 *
 * A placeholder with nothing to fill it is left standing rather than replaced
 * with "undefined": the mistake stays visible instead of reading as content.
 */
export function translate(
  lang: Lang,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const text = DICTS[lang]?.[key] ?? en[key];
  if (!vars) return text;

  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** Every key the chosen language has not been given words for yet. */
export function untranslated(lang: Lang): MessageKey[] {
  const dict = DICTS[lang] ?? {};
  return (Object.keys(en) as MessageKey[]).filter((key) => !(key in dict));
}

/**
 * The language a cookie header asks for, or the default.
 *
 * Takes the raw header so the same function serves the server, which has a
 * string, and the browser, which has `document.cookie`.
 */
export function langFromCookie(header: string | null | undefined): Lang {
  if (!header) return DEFAULT_LANG;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LANG_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return isLang(value) ? value : DEFAULT_LANG;
    }
  }
  return DEFAULT_LANG;
}

export function storeLang(lang: Lang): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${LANG_COOKIE}=${lang}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * Put the choice on the document.
 *
 * `lang` on <html> is what tells the browser which font to reach for and what
 * to say to a screen reader — neither of which a stylesheet can express.
 */
export function applyLang(lang: Lang): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
}
