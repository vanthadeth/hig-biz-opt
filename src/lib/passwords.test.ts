import { describe, expect, it } from "vitest";
import {
  generatePassword,
  passwordFromBytes,
  passwordProblem,
  PASSWORD_LENGTH,
  PASSWORD_MIN,
} from "./passwords";

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("a password somebody has to type off another screen", () => {
  it("is the same password for the same bytes", () => {
    // Split from the randomness on purpose: a generator that cannot be pinned
    // is a generator nothing can be asserted about.
    const run = bytes(...Array.from({ length: 16 }, (_, i) => i));
    expect(passwordFromBytes(run)).toBe(passwordFromBytes(run));
  });

  it("comes in groups, the shape people expect to type", () => {
    const password = generatePassword();
    expect(password).toMatch(/^[^-]{4}-[^-]{4}-[^-]{4}-[^-]{4}$/);
    expect(password.replace(/-/g, "")).toHaveLength(PASSWORD_LENGTH);
  });

  it("leaves out every character somebody could read two ways", () => {
    // Not fussiness: a password that arrives wrong twice gets replaced by
    // something like "hig1234", which is the real failure.
    const all = Array.from({ length: 256 }, (_, i) => i);
    const produced = passwordFromBytes(Uint8Array.from(all)).replace(/-/g, "");
    for (const forbidden of ["0", "O", "1", "l", "I", "5", "S", "2", "Z", "8", "B"]) {
      expect(produced).not.toContain(forbidden);
    }
  });

  it("uses a wide enough alphabet to be worth the length", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      for (const ch of generatePassword().replace(/-/g, "")) seen.add(ch);
    }
    expect(seen.size).toBeGreaterThan(40);
  });

  it("does not hand out the same one twice", () => {
    const many = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(many.size).toBe(200);
  });
});

describe("what is wrong with a password somebody chose", () => {
  it("says too short before it says anything else", () => {
    expect(passwordProblem("abc", "xyz")).toBe(
      `A password is at least ${PASSWORD_MIN} characters.`,
    );
  });

  it("catches a password that starts or ends with a space", () => {
    // Typed on a phone, where the keyboard adds one after a word.
    expect(passwordProblem("goodenough ", "goodenough ")).toBe(
      "A password cannot start or end with a space.",
    );
  });

  it("catches the two not matching", () => {
    expect(passwordProblem("goodenough", "goodenougi")).toBe("Those two do not match.");
  });

  it("has nothing to say about a good one", () => {
    expect(passwordProblem("goodenough", "goodenough")).toBeNull();
  });
});
