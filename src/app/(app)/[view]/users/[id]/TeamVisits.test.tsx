import { screen } from "@testing-library/react";
import { render } from "@/test/i18n";
import { describe, expect, it } from "vitest";
import type { VisitRow } from "@/lib/visits";
import { TeamVisits } from "./TeamVisits";

const visit = (over: Partial<VisitRow> = {}): VisitRow => ({
  id: "v1", user_id: "u1", customer_id: "c1",
  checked_in_at: "2026-09-07T03:20:00Z", checked_out_at: "2026-09-07T04:00:00Z",
  in_latitude: 11.5, in_longitude: 104.9, out_latitude: 11.5, out_longitude: 104.9,
  distance_m: 90, out_of_range: false, radius_m: 200,
  visit_type_id: null, visit_status_id: null,
  order_status_id: null, payment_status_id: null,
  next_appointment: null, remarks: null,
  cancelled_at: null, cancel_reason: null,
  checkout_distance_m: null, checkout_out_of_range: false,
  customer: { shop_name: "Corner Mart", latitude: 11.5, longitude: 104.9, province_code: "12", province_text: null },
  ...over,
});

describe("a subordinate's calls, found on their own account page", () => {
  it("draws nothing when there is nothing to show -- no reach, or no calls", () => {
    const { container } = render(<TeamVisits viewKey="sales" visits={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the shop and links to the real visit page", () => {
    render(<TeamVisits viewKey="sales" visits={[visit()]} />);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("Corner Mart");
    expect(link).toHaveAttribute("href", "/sales/visits/v1");
  });

  it("marks an open call rather than showing a distance for it", () => {
    render(<TeamVisits viewKey="sales" visits={[visit({ checked_out_at: null })]} />);
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("marks a cancelled call instead of its distance too", () => {
    render(
      <TeamVisits
        viewKey="sales"
        visits={[visit({ cancelled_at: "2026-09-07T03:30:00Z", cancel_reason: "Wrong shop" })]}
      />,
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("otherwise says how far off the check-in was", () => {
    render(<TeamVisits viewKey="sales" visits={[visit()]} />);
    expect(screen.getByText("90 m away")).toBeInTheDocument();
  });
});
