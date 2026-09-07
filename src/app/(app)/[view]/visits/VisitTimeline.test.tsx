import { screen, within } from "@testing-library/react";
import { render } from "@/test/i18n";
import { describe, expect, it } from "vitest";
import type { VisitRow } from "@/lib/visits";
import { VisitTimeline } from "./VisitTimeline";

const NOW = Date.parse("2026-09-07T09:00:00Z");
const PROVINCES = new Map([
  ["12", "Phnom Penh"],
  ["08", "Kandal"],
]);

const shop = (name: string, code: string | null, text: string | null = null) => ({
  shop_name: name, latitude: 11.5, longitude: 104.9,
  province_code: code, province_text: text,
});

const visit = (over: Partial<VisitRow> = {}): VisitRow => ({
  id: "v1", user_id: "u1", customer_id: "c1",
  checked_in_at: "2026-09-07T01:12:00Z", checked_out_at: "2026-09-07T01:48:00Z",
  in_latitude: 11.5, in_longitude: 104.9, out_latitude: 11.5, out_longitude: 104.9,
  distance_m: 40, out_of_range: false,
  checkout_distance_m: 40, checkout_out_of_range: false,
  radius_m: 200, visit_type_id: null, visit_status_id: null,
  order_status_id: null, payment_status_id: null, next_appointment: null,
  remarks: null, cancelled_at: null, cancel_reason: null,
  customer: shop("Corner Mart", "12"),
  ...over,
});

const draw = (visits: VisitRow[]) =>
  render(
    <VisitTimeline
      viewKey="sales"
      day="2026-09-07"
      visits={visits}
      provinces={PROVINCES}
      nowMs={NOW}
    />,
  );

describe("a day read as the day it was", () => {
  it("brackets the calls with a clocking in and a clocking out", () => {
    draw([
      visit({ id: "a", checked_in_at: "2026-09-07T01:12:00Z", checked_out_at: "2026-09-07T01:48:00Z" }),
      visit({ id: "b", checked_in_at: "2026-09-07T03:00:00Z", checked_out_at: "2026-09-07T03:30:00Z" }),
    ]);

    // The Cambodian clock, seven hours ahead of the timestamps above.
    expect(screen.getByText("Clocked in").parentElement).toHaveTextContent("08:12");
    expect(screen.getByText("Clocked out").parentElement).toHaveTextContent("10:30");
  });

  it("reads downwards in the order the day happened, not newest first", () => {
    draw([
      visit({ id: "b", checked_in_at: "2026-09-07T03:00:00Z", customer: shop("Later Shop", "12") }),
      visit({ id: "a", checked_in_at: "2026-09-07T01:12:00Z", customer: shop("Earlier Shop", "12") }),
    ]);

    const names = screen.getAllByRole("link").map((link) => link.textContent ?? "");
    expect(names[0]).toContain("Earlier Shop");
    expect(names[1]).toContain("Later Shop");
  });

  it("says the day is still being worked rather than inventing a finish", () => {
    draw([visit({ checked_out_at: null })]);
    expect(screen.getByText("Still out")).toBeInTheDocument();
    expect(screen.queryByText("Clocked out")).not.toBeInTheDocument();
  });

  it("gives each call its two times and its length", () => {
    draw([visit()]);
    expect(screen.getByRole("link")).toHaveTextContent("08:12–08:48 · 36m");
  });

  // Two shops of the same name three provinces apart are two shops, and a
  // name on its own makes them look like one.
  it("names the province the shop is in", () => {
    draw([visit({ customer: shop("Sok Heng", "08") })]);
    expect(screen.getByRole("link")).toHaveTextContent("Sok Heng (Kandal)");
  });

  it("falling back to what somebody wrote when there is no code", () => {
    draw([visit({ customer: shop("Sok Heng", null, "Kampot") })]);
    expect(screen.getByRole("link")).toHaveTextContent("Sok Heng (Kampot)");
  });

  it("and says nothing at all where there is no province", () => {
    draw([visit({ customer: shop("Sok Heng", null) })]);
    expect(screen.getByRole("link")).toHaveTextContent("Sok Heng");
    expect(screen.getByRole("link").textContent).not.toContain("(");
  });

  it("opens the visit when the row is tapped", () => {
    draw([visit({ id: "abc" })]);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/sales/visits/abc");
  });
});

describe("the flag a row carries", () => {
  it("is silent when both ends were at the shop", () => {
    draw([visit()]);
    expect(screen.queryByText("Away")).not.toBeInTheDocument();
    expect(screen.queryByText("No pin")).not.toBeInTheDocument();
  });

  it("warns about a check-in from somewhere else", () => {
    draw([visit({ out_of_range: true, distance_m: 9600 })]);
    expect(screen.getByText("Away")).toBeInTheDocument();
  });

  // The half the check-out measurement was added for: at the door on arrival,
  // and gone by the time the visit was closed.
  it("and about a check-out from somewhere else", () => {
    draw([visit({ checkout_out_of_range: true, checkout_distance_m: 9600 })]);
    expect(screen.getByText("Away")).toBeInTheDocument();
  });

  it("marks an unmeasured visit unknown rather than away", () => {
    draw([visit({ distance_m: null, checkout_distance_m: null })]);
    expect(screen.getByText("No pin")).toBeInTheDocument();
  });

  it("and a cancelled one as cancelled, above anything about distance", () => {
    draw([
      visit({
        out_of_range: true, distance_m: 9600,
        cancelled_at: "2026-09-07T02:00:00Z", cancel_reason: "Tapped by mistake",
      }),
    ]);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByText("Away")).not.toBeInTheDocument();
  });

  // A called-off visit still happened to the list — it is what the day looked
  // like — but it must not move the two clock marks.
  it("a cancelled call is shown without counting towards the day's ends", () => {
    draw([
      visit({
        id: "a", checked_in_at: "2026-09-07T00:30:00Z", checked_out_at: "2026-09-07T00:40:00Z",
        cancelled_at: "2026-09-07T00:45:00Z", cancel_reason: "Wrong shop",
      }),
      visit({ id: "b", checked_in_at: "2026-09-07T01:12:00Z", checked_out_at: "2026-09-07T01:48:00Z" }),
    ]);

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("Clocked in").parentElement).toHaveTextContent("08:12");
  });
});

describe("a visit somewhere that is not a shop", () => {
  it("says so, and flags nothing", () => {
    draw([
      visit({
        customer_id: null, customer: null,
        distance_m: null, checkout_distance_m: null,
      }),
    ]);
    const row = screen.getByRole("link");
    expect(within(row).getByText("Somewhere else")).toBeInTheDocument();
    expect(screen.queryByText("No pin")).not.toBeInTheDocument();
  });
});
