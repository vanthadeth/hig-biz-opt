import { screen } from "@testing-library/react";
import { render } from "@/test/i18n";
import { describe, expect, it, vi } from "vitest";
import { NO_QUOTA } from "@/lib/quota";
import type { VisitRow } from "@/lib/visits";
import { VisitDay } from "./VisitDay";

const push = () => {};
const refresh = () => {};
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

vi.mock("./useFix", () => ({
  useFix: () => ({ fix: null, problem: "Location is switched off for this site." }),
}));

const NOW = "2026-09-07T04:00:00Z"; // 11:00 in Phnom Penh

const shop = (name: string) => ({
  shop_name: name, latitude: 11.5, longitude: 104.9,
  province_code: "12", province_text: null,
});

const visit = (over: Partial<VisitRow> = {}): VisitRow => ({
  id: "v1", user_id: "me", customer_id: "c1",
  checked_in_at: "2026-09-07T03:20:00Z", checked_out_at: null,
  in_latitude: 11.5, in_longitude: 104.9, out_latitude: null, out_longitude: null,
  distance_m: 90, out_of_range: false, radius_m: 200,
  visit_type_id: null, visit_status_id: null,
  order_status_id: null, payment_status_id: null,
  next_appointment: null, remarks: null,
  cancelled_at: null, cancel_reason: null,
  checkout_distance_m: null, checkout_out_of_range: false,
  customer: shop("Corner Mart"),
  ...over,
});

const draw = (visits: VisitRow[]) =>
  render(
    <VisitDay
      viewKey="sales"
      userId="me"
      visits={visits}
      quota={NO_QUOTA}
      provinces={[]}
      now={NOW}
    />,
  );

// visit:view:sub means a supervisor's own screen can now carry a
// subordinate's rows alongside their own -- every reading of "my day" has to
// keep telling the two apart.
describe("whose day this actually is, once a subordinate's rows can arrive too", () => {
  it("does not mistake a subordinate's open visit for the viewer's own", () => {
    draw([visit({ id: "theirs", user_id: "subordinate", checked_out_at: null })]);

    // Not checked in themselves, so the start-a-visit button is offered --
    // the wrong answer here would be showing their subordinate's open call
    // as if it were the viewer's own.
    expect(screen.getByRole("button", { name: "New visit" })).toBeInTheDocument();
    expect(screen.queryByText("Open")).toBeNull();
  });

  it("still finds the viewer's own open visit among a subordinate's rows", () => {
    draw([
      visit({ id: "theirs", user_id: "subordinate", checked_out_at: null }),
      visit({ id: "mine", user_id: "me", checked_out_at: null, customer: shop("My Shop") }),
    ]);

    // Shows up twice on purpose: once in the open-visit card, once in the
    // timeline below it, since a viewer's own timeline includes their open
    // call too.
    expect(screen.getAllByText("My Shop").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "New visit" })).toBeNull();
  });

  it("keeps a subordinate's closed calls out of the viewer's own timeline", () => {
    draw([
      visit({
        id: "theirs", user_id: "subordinate",
        checked_out_at: "2026-09-07T03:40:00Z", customer: shop("Their Shop"),
      }),
    ]);

    expect(screen.queryByText("Their Shop")).toBeNull();
    expect(screen.getByText("No visits recorded in the last fortnight.")).toBeInTheDocument();
  });
});
