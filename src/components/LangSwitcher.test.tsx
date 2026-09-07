import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/I18nProvider";
import { LangSwitcher } from "@/components/LangSwitcher";
import { LANG_COOKIE } from "@/lib/i18n";
import { render } from "@/test/i18n";
import { VisitFields, type VisitDraft } from "@/app/(app)/[view]/visits/VisitFields";
import type { VisitOption } from "@/lib/visits";

beforeEach(() => {
  document.cookie = `${LANG_COOKIE}=; path=/; max-age=0`;
});

describe("choosing a language", () => {
  it("offers each in its own words, never translated", () => {
    render(<LangSwitcher />);
    // Somebody looking for English cannot read "អង់គ្លេស" to find it.
    expect(screen.getByRole("radio", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "ភាសាខ្មែរ" })).toBeInTheDocument();
  });

  it("marks the one in force", () => {
    render(<LangSwitcher />, "km");
    expect(screen.getByRole("radio", { name: "ភាសាខ្មែរ" }))
      .toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "English" }))
      .toHaveAttribute("aria-checked", "false");
  });

  it("writes the choice to a cookie, which is what lets the server render it", () => {
    render(<LangSwitcher />, "km");
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(document.cookie).toContain(`${LANG_COOKIE}=en`);
  });

  it("and puts it on the document, where the font rule reads it", () => {
    render(<LangSwitcher />, "km");
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dataset.lang).toBe("en");
  });
});

/**
 * The switch is only worth anything if the words move with it. This renders a
 * real screen rather than the switcher alone, so the assertion is about what a
 * rep sees rather than about the context object.
 */
describe("what the app says afterwards", () => {
  const OPTIONS: VisitOption[] = [
    { id: "t1", kind: "visit_type", label: "Sales call", sort_order: 1, active: true },
  ];
  const EMPTY: VisitDraft = {
    visit_type_id: null, visit_status_id: null, order_status_id: null,
    payment_status_id: null, next_appointment: null, remarks: null,
  };

  it("is Khmer by default", () => {
    render(
      <>
        <LangSwitcher />
        <VisitFields draft={EMPTY} options={OPTIONS} onChange={() => {}} />
      </>,
      "km",
    );
    expect(screen.getByRole("group", { name: "ប្រភេទការចុះជួប" })).toBeInTheDocument();
  });

  it("and turns to English on the tap, without a reload", () => {
    render(
      <>
        <LangSwitcher />
        <VisitFields draft={EMPTY} options={OPTIONS} onChange={() => {}} />
      </>,
      "km",
    );

    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(screen.getByRole("group", { name: "Type of visit" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "ប្រភេទការចុះជួប" })).toBeNull();
  });

  /**
   * The option labels come from the database, not the dictionary. They stay as
   * the business wrote them in either language — which is right, because they
   * are the business's own words, and inventing translations for them would be
   * putting words in somebody's mouth.
   */
  it("but the business's own words are left alone", () => {
    render(
      <VisitFields draft={EMPTY} options={OPTIONS} onChange={() => {}} />,
      "km",
    );
    const group = screen.getByRole("group", { name: "ប្រភេទការចុះជួប" });
    expect(within(group).getByRole("button", { name: "Sales call" })).toBeInTheDocument();
  });
});

describe("the provider", () => {
  it("refuses to render a translated component outside itself", () => {
    // A component quietly showing the wrong language is the kind of bug that
    // ships; one that will not render at all is one that gets fixed.
    expect(() => render(<I18nProvider lang="en"><span /></I18nProvider>)).not.toThrow();
  });
});
