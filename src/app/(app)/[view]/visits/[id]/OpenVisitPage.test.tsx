import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  customer: { shop_name: "Corner Mart", latitude: 11.5564, longitude: 104.9282 },
  ...over,
});

const draw = (over: Partial<VisitRow> = {}) =>
  render(<OpenVisitPage viewKey="sales" visit={visit(over)} options={OPTIONS} now={NOW} />);

beforeEach(() => {
  push.mockClear(); refresh.mockClear(); update.mockClear(); rpc.mockClear();
  updateResult = { data: [{ id: "v1" }], error: null };
  rpcResult = { data: null, error: null };
});

describe("the check-in screen", () => {
  it("leads with when you arrived", () => {
    draw();
    expect(screen.getByText("10:20")).toBeInTheDocument();
    expect(screen.getByText("40m ago")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Corner Mart" })).toBeInTheDocument();
  });

  it("then the record, with nothing required", () => {
    draw();
    expect(screen.getByText("Visit record")).toBeInTheDocument();
    for (const control of screen.getAllByRole("combobox")) {
      expect(control).not.toBeRequired();
      expect(control).not.toBeDisabled();
    }
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
    fireEvent.change(screen.getByLabelText(/Order status/), { target: { value: "o1" } });
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
