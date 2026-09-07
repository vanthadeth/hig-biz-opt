import { render as baseRender } from "@testing-library/react";
import { I18nProvider } from "@/components/I18nProvider";
import type { Lang } from "@/lib/i18n";

/**
 * Render a component that speaks.
 *
 * English by default, because the assertions in these tests are written in
 * English and a test that asserts Khmer would be testing the dictionary rather
 * than the component. `lang` is there for the few that check the switch itself.
 *
 * `useT()` throws outside the provider on purpose — a component quietly
 * rendering in the wrong language is the kind of bug that ships — so this
 * exists rather than a default that would hide the mistake.
 */
export function render(ui: React.ReactElement, lang: Lang = "en") {
  return baseRender(<I18nProvider lang={lang}>{ui}</I18nProvider>);
}
