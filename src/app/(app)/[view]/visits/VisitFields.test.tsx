import {fireEvent, screen, within } from "@testing-library/react";
import { render } from "@/test/i18n";
import { describe, expect, it, vi } from "vitest";
import type { VisitOption } from "@/lib/visits";
import { VisitFields, fromLocalInput, toLocalInput, type VisitDraft } from "./VisitFields";

const OPTIONS: VisitOption[] = [
  { id: "t1", kind: "visit_type", label: "Sales call", sort_order: 1, active: true },
  { id: "t2", kind: "visit_type", label: "Delivery", sort_order: 2, active: true },
  { id: "s1", kind: "visit_status", label: "Met the owner", sort_order: 1, active: true },
  { id: "o1", kind: "order_status", label: "Ordered", sort_order: 1, active: true },
  { id: "p1", kind: "payment_status", label: "Paid in full", sort_order: 1, active: true },
  { id: "x1", kind: "visit_type", label: "Retired wording", sort_order: 9, active: false },
];

const EMPTY: VisitDraft = {
  visit_type_id: null, visit_status_id: null, order_status_id: null,
  payment_status_id: null, next_appointment: null, remarks: null,
};

describe("the record of a call", () => {
  it("asks the four questions the business chose the words for", () => {
    render(<VisitFields draft={EMPTY} options={OPTIONS} onChange={() => {}} />);

    for (const label of ["Type of visit", "Visit status", "Order status", "Payment status"]) {
      expect(screen.getByRole("group", { name: label })).toBeInTheDocument();
    }
  });

  /**
   * A native select on a phone costs three interactions and hides every option
   * until the first of them. Standing in a shop with the owner waiting, that
   * is the difference between a record filled in and a record skipped.
   */
  it("offers every answer as a button, visible without touching anything", () => {
    render(<VisitFields draft={EMPTY} options={OPTIONS} onChange={() => {}} />);

    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    const group = screen.getByRole("group", { name: "Type of visit" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent))
      .toEqual(["Sales call", "Delivery"]);
  });

  it("marks the chosen one, and tapping it again clears it", () => {
    const onChange = vi.fn();
    render(
      <VisitFields draft={{ ...EMPTY, visit_type_id: "t1" }} options={OPTIONS}
        onChange={onChange} />,
    );

    const group = screen.getByRole("group", { name: "Type of visit" });
    const chosen = within(group).getByRole("button", { name: "Sales call" });
    expect(chosen).toHaveAttribute("aria-pressed", "true");

    // Nothing here is required, so there has to be a way back to unanswered.
    fireEvent.click(chosen);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, visit_type_id: null });
  });

  it("and never offers a word that has been retired", () => {
    render(<VisitFields draft={EMPTY} options={OPTIONS} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Retired wording" })).toBeNull();
  });

  it("leaves a question out entirely when the business has no words for it", () => {
    const only = OPTIONS.filter((o) => o.kind === "visit_type");
    render(<VisitFields draft={EMPTY} options={only} onChange={() => {}} />);

    expect(screen.getByRole("group", { name: "Type of visit" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Payment status" })).toBeNull();
  });

  it("starts with nothing chosen, because a rep walking in does not know yet", () => {
    render(<VisitFields draft={EMPTY} options={OPTIONS} onChange={() => {}} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("reports a choice as the id the visit stores", () => {
    const onChange = vi.fn();
    render(<VisitFields draft={EMPTY} options={OPTIONS} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Delivery" }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, visit_type_id: "t2" });
  });

  it("takes remarks as words and null as no words", () => {
    const onChange = vi.fn();
    render(<VisitFields draft={EMPTY} options={OPTIONS} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/Remarks/), { target: { value: "Owner away" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, remarks: "Owner away" });

    onChange.mockClear();
    render(
      <VisitFields draft={{ ...EMPTY, remarks: "x" }} options={OPTIONS} onChange={onChange} />,
    );
    fireEvent.change(screen.getAllByLabelText(/Remarks/)[1], { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, remarks: null });
  });

  it("goes read-only in one piece, so a closed visit cannot be typed into", () => {
    render(<VisitFields draft={EMPTY} options={OPTIONS} disabled onChange={() => {}} />);

    for (const control of [...screen.getAllByRole("button"), ...screen.getAllByRole("textbox")]) {
      expect(control).toBeDisabled();
    }
    expect(screen.getByLabelText(/Next appointment/)).toBeDisabled();
  });
});

/**
 * The datetime input speaks the browser's local time with no zone on it.
 * Everyone here is on a phone set to Cambodia, so local and here are the same
 * — but a next appointment that lands an hour out is a rep standing outside a
 * shut shop, so the conversion is asserted rather than assumed.
 */
describe("the next appointment, in and out of the input", () => {
  it("round-trips a time through the input and back", () => {
    const iso = new Date(2026, 8, 10, 14, 30).toISOString();
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });

  it("writes it the way the input wants it, zero-padded", () => {
    const local = toLocalInput(new Date(2026, 0, 5, 9, 5).toISOString());
    expect(local).toBe("2026-01-05T09:05");
  });

  it("treats nothing as nothing rather than as the epoch", () => {
    expect(toLocalInput(null)).toBe("");
    expect(fromLocalInput("")).toBeNull();
  });

  it("and refuses to invent a date out of rubbish", () => {
    expect(toLocalInput("not a date")).toBe("");
    expect(fromLocalInput("not a date")).toBeNull();
  });
});
