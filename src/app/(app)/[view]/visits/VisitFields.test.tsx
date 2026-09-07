import { fireEvent, render, screen } from "@testing-library/react";
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
      expect(screen.getByLabelText(new RegExp(label))).toBeInTheDocument();
    }
  });

  it("and never offers a word that has been retired", () => {
    render(<VisitFields draft={EMPTY} options={OPTIONS} onChange={() => {}} />);
    expect(screen.queryByRole("option", { name: "Retired wording" })).toBeNull();
  });

  it("leaves a dropdown out entirely when the business has no words for it", () => {
    const only = OPTIONS.filter((o) => o.kind === "visit_type");
    render(<VisitFields draft={EMPTY} options={only} onChange={() => {}} />);

    expect(screen.getByLabelText(/Type of visit/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Payment status/)).toBeNull();
  });

  it("requires nothing, because a rep walking in does not know yet how it went", () => {
    render(<VisitFields draft={EMPTY} options={OPTIONS} onChange={() => {}} />);
    for (const control of screen.getAllByRole("combobox")) {
      expect(control).not.toBeRequired();
      expect((control as HTMLSelectElement).value).toBe("");
    }
  });

  it("reports a choice as the id the visit stores", () => {
    const onChange = vi.fn();
    render(<VisitFields draft={EMPTY} options={OPTIONS} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/Type of visit/), { target: { value: "t2" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, visit_type_id: "t2" });
  });

  it("and clearing one back to nothing is null, not an empty string", () => {
    const onChange = vi.fn();
    render(
      <VisitFields draft={{ ...EMPTY, visit_type_id: "t2" }} options={OPTIONS}
        onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText(/Type of visit/), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, visit_type_id: null });
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

    for (const control of [...screen.getAllByRole("combobox"), ...screen.getAllByRole("textbox")]) {
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
