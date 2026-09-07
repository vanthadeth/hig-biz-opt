import {fireEvent, screen } from "@testing-library/react";
import { render } from "@/test/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VisitOption, VisitRow } from "@/lib/visits";
import { VisitRecord } from "./VisitRecord";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const update = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: unknown) => {
        update(patch);
        return { eq: () => ({ select: async () => ({ data: [{ id: "v1" }], error: null }) }) };
      },
    }),
  }),
}));

const OPTIONS: VisitOption[] = [
  { id: "t1", kind: "visit_type", label: "Sales call", sort_order: 1, active: true },
  { id: "o1", kind: "order_status", label: "Ordered", sort_order: 1, active: true },
];

const HOUR = 3_600_000;
const CLOSED = "2026-09-03T02:00:00Z";

const visit = (over: Partial<VisitRow> = {}): VisitRow => ({
  id: "v1",
  user_id: "u1",
  customer_id: "c1",
  checked_in_at: "2026-09-03T01:00:00Z",
  checked_out_at: CLOSED,
  in_latitude: 11.5564, in_longitude: 104.9282,
  out_latitude: null, out_longitude: null,
  distance_m: 90, out_of_range: false, radius_m: 200,
  visit_type_id: null, visit_status_id: null,
  order_status_id: null, payment_status_id: null,
  next_appointment: null, remarks: null,
  cancelled_at: null, cancel_reason: null,
  checkout_distance_m: null, checkout_out_of_range: false,
  customer: { shop_name: "Corner Mart", latitude: 11.5564, longitude: 104.9282, province_code: "12", province_text: null },
  ...over,
});

const at = (hours: number) => new Date(Date.parse(CLOSED) + hours * HOUR).toISOString();

beforeEach(() => {
  refresh.mockClear();
  update.mockClear();
});

describe("a visit, and the day there is to correct it", () => {
  it("shows the two timestamps but offers no way to change them", () => {
    render(<VisitRecord visit={visit()} options={OPTIONS} now={at(1)} />);

    expect(screen.getByText("08:00")).toBeInTheDocument(); // 01:00Z here
    expect(screen.getByText("09:00")).toBeInTheDocument(); // 02:00Z here
    // Nothing on the page can edit them: the only inputs are the record's.
    for (const box of screen.getAllByRole("textbox")) {
      expect(box).not.toHaveValue("08:00");
    }
    expect(screen.queryByLabelText(/Arrived/)).toBeNull();
    expect(screen.queryByLabelText(/Left/)).toBeNull();
  });

  it("lets the record be corrected within the day", () => {
    render(<VisitRecord visit={visit()} options={OPTIONS} now={at(23)} />);

    const ordered = screen.getByRole("button", { name: "Ordered" });
    expect(ordered).not.toBeDisabled();

    fireEvent.click(ordered);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ order_status_id: "o1" }),
    );
  });

  it("and says how long is left, so nobody is surprised by the cut-off", () => {
    render(<VisitRecord visit={visit()} options={OPTIONS} now={at(23)} />);
    expect(screen.getByText("1h left to correct this.")).toBeInTheDocument();
  });

  it("closes the record when the day is up", () => {
    render(<VisitRecord visit={visit()} options={OPTIONS} now={at(25)} />);

    expect(screen.getByRole("button", { name: "Ordered" })).toBeDisabled();
    expect(screen.getByLabelText(/Remarks/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
    expect(screen.getByText(/now the record/)).toBeInTheDocument();
  });

  it("exactly at the day, not a minute after it", () => {
    render(<VisitRecord visit={visit()} options={OPTIONS} now={at(24)} />);
    expect(screen.getByRole("button", { name: "Ordered" })).toBeDisabled();
  });

  it("a visit still open is always open to writing", () => {
    render(
      <VisitRecord visit={visit({ checked_out_at: null })} options={OPTIONS}
        now={at(1000)} />,
    );

    expect(screen.getByRole("button", { name: "Ordered" })).not.toBeDisabled();
    expect(screen.getByText("Still open")).toBeInTheDocument();
    // No countdown, because nothing is counting down yet.
    expect(screen.queryByText(/left to correct/)).toBeNull();
  });

  it("will not save what has not changed", () => {
    render(<VisitRecord visit={visit()} options={OPTIONS} now={at(1)} />);
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
  });

  it("says a check-in landed outside the radius, and how far outside", () => {
    render(
      <VisitRecord
        visit={visit({ distance_m: 1500, out_of_range: true })}
        options={OPTIONS}
        now={at(1)}
      />,
    );

    expect(screen.getByText("1.5 km away")).toBeInTheDocument();
    expect(screen.getByText(/outside 200 m/)).toBeInTheDocument();
  });

  it("calls a missing distance unknown rather than nought metres", () => {
    render(
      <VisitRecord
        visit={visit({ distance_m: null, in_latitude: null, in_longitude: null })}
        options={OPTIONS}
        now={at(1)}
      />,
    );
    expect(screen.getByText("Distance unknown")).toBeInTheDocument();
  });

  it("and says which side of it was missing — here, the phone's", () => {
    render(
      <VisitRecord
        visit={visit({ distance_m: null, in_latitude: null, in_longitude: null })}
        options={OPTIONS}
        now={at(1)}
      />,
    );
    expect(screen.getByText(/No location was recorded at check-in/)).toBeInTheDocument();
  });

  it("and here, the shop's", () => {
    render(
      <VisitRecord
        visit={visit({
          distance_m: null,
          customer: { shop_name: "Corner Mart", latitude: null, longitude: null, province_code: null, province_text: null },
        })}
        options={OPTIONS}
        now={at(1)}
      />,
    );
    expect(screen.getByText(/no location saved yet/)).toBeInTheDocument();
  });

  it("and names a visit that was not to a shop at all", () => {
    render(
      <VisitRecord
        visit={visit({ customer_id: null, customer: null, distance_m: null })}
        options={OPTIONS}
        now={at(1)}
      />,
    );
    expect(screen.getByText("Somewhere else")).toBeInTheDocument();
    expect(screen.getByText(/not to a shop/)).toBeInTheDocument();
  });

  it("names a shop that has since been removed rather than showing nothing", () => {
    render(<VisitRecord visit={visit({ customer: null })} options={OPTIONS} now={at(1)} />);
    expect(screen.getByText("Shop removed")).toBeInTheDocument();
  });
});

describe("where the rep was when they left", () => {
  it("says nothing when the visit was closed at the shop", () => {
    render(<VisitRecord visit={visit()} options={OPTIONS} now={at(1)} />);
    expect(screen.queryByText(/Checked out/)).not.toBeInTheDocument();
  });

  it("but names the distance when it was closed from somewhere else", () => {
    render(
      <VisitRecord
        visit={visit({ checkout_out_of_range: true, checkout_distance_m: 9800 })}
        options={OPTIONS}
        now={at(1)}
      />,
    );
    expect(
      screen.getByText("Checked out 9.8 km from the shop, outside 200 m."),
    ).toBeInTheDocument();
  });

  // The chip at the top is about arriving. A visit that arrived at the door
  // and was closed from the next district would otherwise wear a green chip
  // and look fine.
  it("and flags it, so a green arrival chip cannot speak for the whole visit", () => {
    render(
      <VisitRecord
        visit={visit({ checkout_out_of_range: true, checkout_distance_m: 9800 })}
        options={OPTIONS}
        now={at(1)}
      />,
    );
    expect(screen.getByText("Away")).toBeInTheDocument();
  });

  it("without saying it twice when the arrival was already out of range", () => {
    render(
      <VisitRecord
        visit={visit({
          out_of_range: true, distance_m: 9600,
          checkout_out_of_range: true, checkout_distance_m: 9800,
        })}
        options={OPTIONS}
        now={at(1)}
      />,
    );
    expect(screen.queryByText("Away")).not.toBeInTheDocument();
    expect(screen.getByText("9.6 km away")).toBeInTheDocument();
  });
});

describe("taking a cancellation back", () => {
  const cancelled = () =>
    visit({ cancelled_at: CLOSED, cancel_reason: "Tapped by mistake" });

  it("is offered on a cancelled visit, and cancelling is not offered twice", () => {
    render(<VisitRecord visit={cancelled()} options={OPTIONS} now={at(1)} />);
    expect(screen.getByText("Restore this visit")).toBeInTheDocument();
    expect(screen.queryByText("Cancel this visit")).not.toBeInTheDocument();
  });

  it("and is not offered on one that was never cancelled", () => {
    render(<VisitRecord visit={visit()} options={OPTIONS} now={at(1)} />);
    expect(screen.queryByText("Restore this visit")).not.toBeInTheDocument();
  });

  // Measured from the check-out, not from the cancelling: a visit that closed
  // two days ago is settled, and the database refuses the write either way.
  it("nor once the day to correct the visit has run out", () => {
    render(<VisitRecord visit={cancelled()} options={OPTIONS} now={at(25)} />);
    expect(screen.queryByText("Restore this visit")).not.toBeInTheDocument();
  });

  it("asks before it does it, the same as cancelling does", () => {
    render(<VisitRecord visit={cancelled()} options={OPTIONS} now={at(1)} />);
    fireEvent.click(screen.getByText("Restore this visit"));
    expect(screen.getByText("Restore this visit?")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("clears both columns together, because half a state is refused", () => {
    render(<VisitRecord visit={cancelled()} options={OPTIONS} now={at(1)} />);
    fireEvent.click(screen.getByText("Restore this visit"));
    fireEvent.click(screen.getByText("Restore it"));
    expect(update).toHaveBeenCalledWith({ cancelled_at: null, cancel_reason: null });
  });

  it("says why the visit was called off while it is still called off", () => {
    render(<VisitRecord visit={cancelled()} options={OPTIONS} now={at(1)} />);
    expect(
      screen.getByText("Cancelled — Tapped by mistake. It counts towards no hours."),
    ).toBeInTheDocument();
  });
});
