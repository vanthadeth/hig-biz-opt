import { describe, expect, it } from "vitest";
import {
  contactIsEmpty,
  contactProblem,
  emptyContact,
  type ContactDraft,
} from "./ContactRows";

const contact = (over: Partial<ContactDraft> = {}): ContactDraft => ({
  ...emptyContact(),
  ...over,
});

describe("contactIsEmpty", () => {
  it("is true for the row a new form offers", () => {
    expect(contactIsEmpty(emptyContact(true))).toBe(true);
  });

  it("is false once anything at all is typed", () => {
    expect(contactIsEmpty(contact({ phone: "012" }))).toBe(false);
    expect(contactIsEmpty(contact({ telegram_id: "@dara" }))).toBe(false);
  });

  it("treats spaces as nothing typed", () => {
    expect(contactIsEmpty(contact({ name: "   ", position: " " }))).toBe(true);
  });
});

describe("contactProblem", () => {
  it("does not object to a row nobody has touched", () => {
    // The regression this guards: a new customer form seeds one blank contact,
    // and treating that as an error blocked the save on every new shop — a
    // stricter rule than the database has, which allows a shop with no contacts
    // recorded yet.
    expect(contactProblem(emptyContact(true))).toBeNull();
  });

  it("objects to a row somebody started and stopped", () => {
    expect(contactProblem(contact({ phone: "012 345 678" }))).toContain("no name");
    expect(contactProblem(contact({ position: "Owner" }))).toContain("no name");
  });

  it("is silent on a named contact", () => {
    expect(contactProblem(contact({ name: "Sok Dara" }))).toBeNull();
  });
});
