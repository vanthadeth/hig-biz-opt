import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CartCustomer } from "@/lib/catalog";
import { CheckInPanel } from "./CheckInPanel";

const shop = (
  id: string, shop_name: string, latitude: number | null, longitude: number | null,
): CartCustomer => ({
  id, shop_name, latitude, longitude,
  street_address: null, province_text: null, district_text: null,
});

// Norodom Boulevard, and shops at increasing distances north of it.
const HERE = { latitude: 11.5564, longitude: 104.9282, accuracy: 10 };
const NEAR = shop("near", "Corner Mart", 11.5573, 104.9282);      // ~100 m
const FAR = shop("far", "Riverside Grocer", 11.5664, 104.9282);   // ~1.1 km
const UNPINNED = shop("unpinned", "Nowhere Shop", null, null);

describe("choosing a shop to check in at", () => {
  it("puts the nearest first, because that is the one the rep is outside", () => {
    render(
      <CheckInPanel
        customers={[FAR, UNPINNED, NEAR]}
        fix={HERE}
        radiusM={200}
        busy={false}
        onCheckIn={() => {}}
      />,
    );

    const names = screen.getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => text.includes("Mart") || text.includes("Grocer") || text.includes("Nowhere"));

    expect(names[0]).toContain("Corner Mart");
    expect(names[1]).toContain("Riverside Grocer");
    // A shop with no pin is not far away, it is unknown — and unknown sorts
    // after everything known rather than to the top.
    expect(names[2]).toContain("Nowhere Shop");
  });

  it("says how far each one is", () => {
    render(
      <CheckInPanel customers={[NEAR, FAR, UNPINNED]} fix={HERE} radiusM={200}
        busy={false} onCheckIn={() => {}} />,
    );

    expect(screen.getByText("Corner Mart").closest("button")!)
      .toHaveTextContent(/1\d\d m away|At the shop/);
    expect(screen.getByText("Riverside Grocer").closest("button")!)
      .toHaveTextContent("1.1 km away");
    // Named for what is missing, since that is something somebody can go and fix.
    expect(screen.getByText("Nowhere Shop").closest("button")!)
      .toHaveTextContent("No pin");
  });

  it("offers a shop outside the radius all the same, since the visit is real", () => {
    const onCheckIn = vi.fn();
    render(
      <CheckInPanel customers={[FAR]} fix={HERE} radiusM={200}
        busy={false} onCheckIn={onCheckIn} />,
    );

    const button = screen.getByText("Riverside Grocer").closest("button")!;
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onCheckIn).toHaveBeenCalledWith(FAR);
  });

  it("says nothing about distance at all when the phone would not say where it is", () => {
    render(
      <CheckInPanel customers={[NEAR, FAR]} fix={null} radiusM={200}
        busy={false} onCheckIn={() => {}} />,
    );

    expect(screen.queryByText(/away/)).toBeNull();
    expect(screen.queryByText("No pin")).toBeNull();
    // And falls back to something predictable rather than an arbitrary order.
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names[0]).toContain("Corner Mart");
  });

  it("shows five and offers the rest, so the fold is not full of scrolling", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      shop(`s${i}`, `Shop ${i}`, 11.5564 + i / 1000, 104.9282));

    render(
      <CheckInPanel customers={many} fix={HERE} radiusM={200}
        busy={false} onCheckIn={() => {}} />,
    );

    expect(screen.queryByText("Shop 5")).toBeNull();
    fireEvent.click(screen.getByText("Show all 9 shops"));
    expect(screen.getByText("Shop 8")).toBeInTheDocument();
  });

  it("and searching skips the question entirely", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      shop(`s${i}`, `Shop ${i}`, 11.5564 + i / 1000, 104.9282));

    render(
      <CheckInPanel customers={many} fix={HERE} radiusM={200}
        busy={false} onCheckIn={() => {}} />,
    );

    fireEvent.change(screen.getByLabelText("Find a shop"), { target: { value: "shop 8" } });
    expect(screen.getByText("Shop 8")).toBeInTheDocument();
    expect(screen.queryByText("Shop 1")).toBeNull();
  });

  it("says so when nothing matches", () => {
    render(
      <CheckInPanel customers={[NEAR]} fix={HERE} radiusM={200}
        busy={false} onCheckIn={() => {}} />,
    );

    fireEvent.change(screen.getByLabelText("Find a shop"), { target: { value: "zzz" } });
    expect(screen.getByText("No shop matches that.")).toBeInTheDocument();
  });

  it("and says something different when there are no shops at all", () => {
    render(
      <CheckInPanel customers={[]} fix={HERE} radiusM={200}
        busy={false} onCheckIn={() => {}} />,
    );

    expect(screen.getByText(/Add a customer first/)).toBeInTheDocument();
  });

  it("refuses a second tap while one check-in is in flight", () => {
    const onCheckIn = vi.fn();
    render(
      <CheckInPanel customers={[NEAR]} fix={HERE} radiusM={200}
        busy onCheckIn={onCheckIn} />,
    );

    const button = screen.getByText("Corner Mart").closest("button")!;
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onCheckIn).not.toHaveBeenCalled();
  });

  it("finds a shop by its address as well as its name", () => {
    const withAddress: CartCustomer = {
      ...NEAR, street_address: "Street 240", district_text: "Chamkarmon",
    };
    render(
      <CheckInPanel customers={[withAddress, FAR]} fix={HERE} radiusM={200}
        busy={false} onCheckIn={() => {}} />,
    );

    fireEvent.change(screen.getByLabelText("Find a shop"), { target: { value: "chamkar" } });
    const list = screen.getByRole("list");
    expect(within(list).getByText("Corner Mart")).toBeInTheDocument();
    expect(within(list).queryByText("Riverside Grocer")).toBeNull();
  });
});
