"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { applyLang, storeLang, translate, type Lang, type MessageKey } from "@/lib/i18n";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

type I18n = { lang: Lang; t: Translate; setLang: (lang: Lang) => void };

const I18nContext = createContext<I18n | null>(null);

/**
 * The chosen language, and the function that uses it.
 *
 * The language arrives as a prop, read from the request's cookie on the
 * server. That is the whole reason it is a cookie: the first render is already
 * in the right language, so there is no mismatch to correct and no moment
 * where a Khmer-speaking rep is shown English.
 */
export function I18nProvider({
  lang: initial,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initial);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    storeLang(next);
    applyLang(next);
  }, []);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Throws outside the provider rather than falling back to English.
 *
 * A component quietly rendering in the wrong language is the kind of bug that
 * ships; a component that will not render at all is one that gets fixed.
 */
export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}

/** The common case: just the words. */
export function useT(): Translate {
  return useI18n().t;
}
