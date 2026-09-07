import {fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "@/test/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartCustomer } from "@/lib/catalog";
import type { VisitOption, VisitRow } from "@/lib/visits";
import { OpenVisitPage } from "./OpenVisitPage";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const update = vi.fn();
const rpc = vi.fn();
let updateResult: { data: unknown; error: unknown } = { data: [{ id: "v1" }], error: null };
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: unknown) => {
        update(patch);
        return { eq: () => ({ select: async () => updateResult }) };
      },
    }),
    rpc: async (name: string, args: unknown) => {
      rpc(name, args);
      return rpcResult;
    },
  }),
}));

// The phone refuses to say where it is, which is the case that must not block
// anything. A granted fix is exercised in the browser pass instead.
vi.mock("../useFix", () => ({
  useFix: () => ({ fix: null, problem: "Location is switched off for this site." }),
}));

const OPTIONS: VisitOption[] = [
  { id: "t1", kind: "visit_type", label: "Sales call", sort_order: 1, active: true },
  { id: "o1", kind: "order_status", label: "Ordered", sort_order: 1, active: true },
];

const NOW = "2026-09-07T04:00:00Z"; // 11:00 in Phnom Penh

const visit = (over: Partial<VisitRow> = {}): VisitRow => ({
  id: "v1", user_id: "u1", customer_id: "c1",
  checked_in_at: "2026-09-07T03:20:00Z",   // 10:20 here, forty minutes ago
  checked_out_at: null,
  in_latitude: 11.5564, in_longitude: 104.9282,
  out_latitude: null, out_longitude: null,
  distance_m: 90, out_of_range: false, radius_m: 200,
  visit_type_id: null, visit_status_id: null,
  order_status_id: null, payment_status_id: null,
  next_appointment: null, remarks: null,
  cancelled_at: null, cancel_reason: null,
  customer: { shop_name: "Corner Mart", latitude: 11.5564, longitude: 104.9282 },
  ...over,
});

const SHOPS: CartCustomer[] = [
  {
    id: "c1", shop_name: "Corner Mart", latitude: 11.5573, longitude: 104.9282,
    street_address: "Street 240", province_text: "Phnom Penh", district_text: "Chamkarmon",
  },
  {
    id: "c2", shop_name: "Riverside Grocer", latitude: 11.5664, longitude: 104.9282,
    street_address: null, province_text: null, district_text: null,
  },
];

const draw = (over: Partial<VisitRow> = {}) =>
  render(
    <OpenVisitPage viewKey="sales" visit={visit(over)} options={OPTIONS}
      customers={SHOPS} now={NOW} />,
  );

beforeEach(() => {
  push.mockClear(); refresh.mockClear(); update.mockClear(); rpc.mockClear();
  updateResult = { data: [{ id: "v1" }], error: null };
  rpcResult = { data: null, error: null };
});

describe("the check-in screen", () => {
  /**
   * The time is the heading, not the shop. It is the part that is already
   * fixed and cannot be argued with; at this point the shop may still be a
   * question.
   */
  it("leads with when you arrived", () => {
    draw();
    expect(screen.getByRole("heading", { name: "10:20" })).toBeInTheDocument();
    expect(screen.getByText("40m ago")).toBeInTheDocument();
    expect(screen.getByText("Corner Mart")).toBeInTheDocument();
  });

  it("then the record, offered as buttons for one-tap answering", () => {
    draw();
    expect(screen.getByText("Visit record")).toBeInTheDocument();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.getByRole("group", { name: "Order status" })).toBeInTheDocument();
  });

  it("and the way out under your thumb", () => {
    draw();
    expect(screen.getByRole("button", { name: "Check out" })).toBeInTheDocument();
  });

  it("says how far off the fix was", () => {
    draw();
    expect(screen.getByText("90 m away")).toBeInTheDocument();
  });

  it("and says why there is no fix now, without stopping anything", () => {
    draw();
    expect(screen.getByText(/Location is switched off/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check out" })).not.toBeDisabled();
  });
});

describe("writing the record while the call goes on", () => {
  it("saves what is typed", async () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Ordered" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ order_status_id: "o1" })));
  });

  it("and will not save what has not changed", () => {
    draw();
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
  });
});

describe("checking out asks first", () => {
  it("does not close the visit on the first tap", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Check out" }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("but says what is about to happen, and that it cannot be undone", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Check out" }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText(/closes the visit to Corner Mart/)).toBeInTheDocument();
    expect(within(sheet).getByText(/40m after checking in/)).toBeInTheDocument();
    expect(within(sheet).getByText(/cannot be changed afterwards/)).toBeInTheDocument();
  });

  it("and backing out changes nothing", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Check out" }));
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));

    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("confirming closes it and goes back to the day", async () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Check out" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Check out" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("check_out", {
        p_visit: "v1", p_latitude: null, p_longitude: null,
      }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sales/visits"));
  });

  it("saves an unsaved remark before closing, not after", async () => {
    draw();
    fireEvent.change(screen.getByLabelText(/Remarks/), { target: { value: "Owner away" } });
    fireEvent.click(screen.getByRole("button", { name: "Check out" }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText(/you have typed will be saved first/)).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "Check out" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ remarks: "Owner away" })));
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
  });

  it("and does not close the visit when that save is refused", async () => {
    updateResult = { data: [], error: null };
    draw();
    fireEvent.change(screen.getByLabelText(/Remarks/), { target: { value: "Owner away" } });
    fireEvent.click(screen.getByRole("button", { name: "Check out" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Check out" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(rpc).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("reports what the database said when the check-out itself is refused", async () => {
    rpcResult = { data: null, error: { message: "That visit is not open" } };
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Check out" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Check out" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("That visit is not open"));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("naming the shop afterwards", () => {
  it("offers a picker when the visit was checked in with no shop", () => {
    draw({ customer_id: null, customer: null, distance_m: null });
    // The picker stands in place of the shop line rather than beside it:
    // "Choose the shop" already says there is not one.
    expect(screen.getByRole("button", { name: "Choose the shop" })).toBeInTheDocument();
    expect(screen.queryByText("Somewhere else")).toBeNull();
  });

  it("and none once the visit already names one — that would be a swap", () => {
    draw();
    expect(screen.queryByRole("button", { name: "Choose the shop" })).toBeNull();
  });

  it("lists the shops nearest first", () => {
    draw({ customer_id: null, customer: null, distance_m: null });
    fireEvent.click(screen.getByRole("button", { name: "Choose the shop" }));

    const sheet = screen.getByRole("dialog");
    const names = within(sheet).getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((t) => t.includes("Mart") || t.includes("Grocer"));
    // No fix in these tests, so the fallback ordering is alphabetical and
    // predictable rather than arbitrary.
    expect(names[0]).toContain("Corner Mart");
    expect(names[1]).toContain("Riverside Grocer");
  });

  it("writes the chosen shop onto the visit", async () => {
    draw({ customer_id: null, customer: null, distance_m: null });
    fireEvent.click(screen.getByRole("button", { name: "Choose the shop" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Riverside Grocer"));

    await waitFor(() => expect(update).toHaveBeenCalledWith({ customer_id: "c2" }));
  });

  it("and never touches the distance, which was measured or never was", async () => {
    draw({ customer_id: null, customer: null, distance_m: null });
    fireEvent.click(screen.getByRole("button", { name: "Choose the shop" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Corner Mart"));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).not.toHaveProperty("distance_m");
  });
});

describe("calling the visit off", () => {
  it("is offered while the visit is live", () => {
    draw();
    expect(screen.getByRole("button", { name: "Cancel this visit" })).toBeInTheDocument();
  });

  it("and not on one already cancelled", () => {
    draw({ cancelled_at: "2026-09-07T03:30:00Z", cancel_reason: "Wrong shop" });
    expect(screen.queryByRole("button", { name: "Cancel this visit" })).toBeNull();
  });

  it("asks first, and will not proceed without a reason", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Cancel this visit" }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText(/counts towards no hours/)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Cancel the visit" })).toBeDisabled();
  });

  it("and goes through once there is one", async () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Cancel this visit" }));

    const sheet = screen.getByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText(/Why/), {
      target: { value: "Tapped by mistake" },
    });

    const confirm = within(sheet).getByRole("button", { name: "Cancel the visit" });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ cancel_reason: "Tapped by mistake" })));
    // The row survives with its times; only the counting stops.
    expect(update.mock.calls[0][0]).not.toHaveProperty("checked_in_at");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sales/visits"));
  });

  it("backing out changes nothing", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Cancel this visit" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("what colour the distance is", () => {
  const toneOf = (text: string) =>
    screen.getByText(text).className;

  it("is not the good-news colour when there is no distance at all", () => {
    draw({ customer_id: null, customer: null, distance_m: null });
    // Green would read as "close enough", which is a claim. Unknown is not one.
    expect(toneOf("Distance unknown")).not.toMatch(/accent/);
  });

  it("but is when the rep was inside the radius", () => {
    draw();
    expect(toneOf("90 m away")).toMatch(/accent/);
  });

  it("and warns when they were outside it", () => {
    draw({ distance_m: 1500, out_of_range: true });
    expect(toneOf("1.5 km away")).toMatch(/warn/);
  });
});
