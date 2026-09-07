import { describe, expect, it } from "vitest";
import { en } from "./en";
import { km } from "./km";
import {
  DEFAULT_LANG,
  LANGS,
  LANG_NAME,
  isLang,
  langFromCookie,
  translate,
  untranslated,
  type MessageKey,
} from "./index";

describe("which language leads", () => {
  it("is Khmer, because that is who the app is for", () => {
    expect(DEFAULT_LANG).toBe("km");
    expect(LANGS[0]).toBe("km");
  });

  it("and each is named in its own language, never translated", () => {
    // Somebody looking for English cannot read "អង់គ្លេស" to find it.
    expect(LANG_NAME.en).toBe("English");
    expect(LANG_NAME.km).toBe("ភាសាខ្មែរ");
  });

  it("recognises only the two", () => {
    expect(isLang("km")).toBe(true);
    expect(isLang("en")).toBe(true);
    expect(isLang("fr")).toBe(false);
    expect(isLang(null)).toBe(false);
  });
});

describe("translating", () => {
  it("gives Khmer for a key Khmer has", () => {
    expect(translate("km", "nav.home")).toBe("ទំព័រដើម");
    expect(translate("en", "nav.home")).toBe("Home");
  });

  /**
   * The point of the fallback. A half-translated app is a working app in two
   * languages; a strict one would be a broken app in neither, and a raw key on
   * screen is worse than a word in the wrong language.
   */
  it("falls back to English for a key Khmer does not have yet", () => {
    const missing = "test.onlyInEnglish" as MessageKey;
    const dict = en as unknown as Record<string, string>;
    dict[missing] = "Only in English";
    try {
      expect(translate("km", missing)).toBe("Only in English");
    } finally {
      delete dict[missing];
    }
  });

  it("fills placeholders rather than gluing fragments together", () => {
    expect(translate("en", "visit.checkedInAt", { time: "10:20" }))
      .toBe("Checked in 10:20");
    expect(translate("km", "visit.checkedInAt", { time: "10:20" }))
      .toContain("10:20");
  });

  it("and leaves a placeholder standing when nothing fills it", () => {
    // Better a visible mistake than the word "undefined" reading as content.
    expect(translate("en", "visit.checkedInAt", {})).toContain("{time}");
  });

  it("takes numbers as well as words", () => {
    expect(translate("en", "report.daysWorked", { count: 3 })).toBe("3 days worked");
  });
});

describe("the two dictionaries", () => {
  it("Khmer never invents a key English does not have", () => {
    const english = new Set(Object.keys(en));
    const stray = Object.keys(km).filter((key) => !english.has(key));
    expect(stray).toEqual([]);
  });

  /**
   * Not "must be empty" — this is a list somebody works through, and asserting
   * zero would mean the test fails the moment a key is added in English, which
   * is exactly when nobody wants a red build. It reports the count so the gap
   * is a number rather than a feeling.
   */
  it("and the gap between them is known rather than guessed at", () => {
    const missing = untranslated("km");
    expect(untranslated("en")).toEqual([]);
    expect(missing.length).toBeLessThan(Object.keys(en).length / 2);
  });

  it("uses the same placeholders in both, so neither can lose a value", () => {
    const holders = (text: string) =>
      (text.match(/\{(\w+)\}/g) ?? []).slice().sort();

    for (const [key, khmer] of Object.entries(km)) {
      const english = (en as Record<string, string>)[key];
      expect(holders(khmer as string), `placeholders differ for ${key}`)
        .toEqual(holders(english));
    }
  });
});

describe("reading the cookie", () => {
  it("finds the language among others", () => {
    expect(langFromCookie("sb-token=abc; hig-lang=en; hig-theme=dark")).toBe("en");
  });

  it("and copes with spacing and encoding", () => {
    expect(langFromCookie("  hig-lang = km ".replace(/ = /, "="))).toBe("km");
  });

  it("falls back to the default for anything it does not recognise", () => {
    expect(langFromCookie("hig-lang=fr")).toBe(DEFAULT_LANG);
    expect(langFromCookie("other=1")).toBe(DEFAULT_LANG);
    expect(langFromCookie("")).toBe(DEFAULT_LANG);
    expect(langFromCookie(null)).toBe(DEFAULT_LANG);
  });

  it("and is not fooled by a cookie whose name merely ends the same way", () => {
    expect(langFromCookie("not-hig-lang=en")).toBe(DEFAULT_LANG);
  });
});
