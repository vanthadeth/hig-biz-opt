"use client";

import { LANGS, LANG_NAME } from "@/lib/i18n";
import { haptic } from "@/lib/haptics";
import { useI18n } from "./I18nProvider";

/**
 * Khmer or English.
 *
 * Each option is written in its own language and never translated — somebody
 * looking for English cannot read "អង់គ្លេស" to find it, and somebody looking
 * for Khmer should not have to read "Khmer".
 */
export function LangSwitcher() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="px-3 py-2">
      <p className="pb-1.5 text-xs font-medium text-muted">{t("nav.language")}</p>
      <div
        role="radiogroup"
        aria-label={t("nav.language")}
        className="flex gap-1 rounded-xl bg-subtle p-1"
      >
        {LANGS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={lang === option}
            lang={option}
            onClick={() => {
              haptic("select");
              setLang(option);
            }}
            className="pressable min-h-9 flex-1 rounded-lg text-sm font-medium text-muted aria-checked:bg-surface aria-checked:text-fg aria-checked:shadow-sm"
          >
            {LANG_NAME[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
