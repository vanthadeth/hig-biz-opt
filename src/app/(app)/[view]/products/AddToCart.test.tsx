import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddToCart } from "./AddToCart";
import type { CatalogItem } from "@/lib/catalog";

const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: "i1",
  code: null,
  name: "Coca Cola",
  name_alt: null,
  active: true,
  price_usd: 1,
  price_khr: null,
  category_id: null,
  category_name: null,
  category_name_alt: null,
  category_parent_id: null,
  category_parent_name: null,
  category_parent_name_alt: null,
  brand_id: null,
  brand_name: null,
  photo_path: null,
  description: null,
  stock_qty: 0,
  low_stock_qty: 0,
  qty_per_box: null,
  qty_per_carton: null,
  ...over,
});

/**
 * Understock selling is a decision the rep makes, not one this screen makes
 * for them — so none of these check that a quantity is blocked. They check
 * the opposite: that nothing here still enforces the old cap, and that
 * going past what is on the shelf is said plainly rather than hidden.
 */
describe("selling more than is on the shelf", () => {
  it("lets the add button be pressed with none on the shelf at all", () => {
    render(
      <AddToCart
        item={item({ stock_qty: 0 })}
        available={0}
        currency="usd"
        alreadyInCart={0}
        busy={false}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Add to cart" })).not.toBeDisabled();
  });

  it("warns rather than blocking once a line outruns the shelf", () => {
    render(
      <AddToCart
        item={item({ stock_qty: 0 })}
        available={0}
        currency="usd"
        alreadyInCart={0}
        busy={false}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByText(/None of this are on the shelf/)).toBeInTheDocument();
  });

  it("says how many will be on backorder when some, but not enough, are on the shelf", () => {
    render(
      <AddToCart
        item={item({ stock_qty: 2 })}
        available={2}
        currency="usd"
        alreadyInCart={0}
        busy={false}
        onAdd={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "More — Order quantity" }));
    fireEvent.click(screen.getByRole("button", { name: "More — Order quantity" }));
    // 3 asked for, 2 on the shelf — one goes on backorder.
    expect(screen.getByText(/Only 2 of this are on the shelf — 1 will be on backorder\./)).toBeInTheDocument();
  });

  it("says nothing while a line still fits on the shelf", () => {
    render(
      <AddToCart
        item={item({ stock_qty: 6 })}
        available={6}
        currency="usd"
        alreadyInCart={0}
        busy={false}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.queryByText(/on backorder/)).not.toBeInTheDocument();
  });

  it("hands the raw quantity to onAdd even when it exceeds the shelf", () => {
    const onAdd = vi.fn();
    render(
      <AddToCart
        item={item({ stock_qty: 1 })}
        available={1}
        currency="usd"
        alreadyInCart={0}
        busy={false}
        onAdd={onAdd}
      />,
    );

    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole("button", { name: "More — Order quantity" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(onAdd).toHaveBeenCalledWith(5, 0, { mode: "percent", percent: 0, amount: 0 });
  });
});
