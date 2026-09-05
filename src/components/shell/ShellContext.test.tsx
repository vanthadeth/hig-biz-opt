import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShellProvider, useShell, usePageTitle, type ShellData } from "./ShellContext";

const data: ShellData = {
  viewer: {
    id: "u1",
    email: "rep@hig.com",
    full_name: "Dara Chan",
    nickname: null,
    photo_path: null,
    is_super_admin: false,
  },
  view: { key: "sales", name: "Sale", description: null, icon: "cart", sort_order: 2 },
  views: [{ key: "sales", name: "Sale", description: null, icon: "cart", sort_order: 2 }],
  nav: [
    {
      module_key: "customer",
      name: "Customer",
      icon: "building",
      href: "customers",
      sort_order: 1,
      group_name: "Selling",
    },
    {
      module_key: "sale_order",
      name: "Sales Order",
      icon: "cart",
      href: "sale-orders",
      sort_order: 2,
      group_name: "Selling",
    },
  ],
  modules: [
    {
      module_key: "customer",
      name: "Customer",
      icon: "building",
      href: "customers",
      sort_order: 1,
      group_name: "Selling",
      view_key: "sales",
      view_name: "Sale",
    },
  ],
  permissions: [],
};

/** Renders usePageTitle's result for a path, inside the provider. */
function Title({ path }: { path: string }) {
  return <span data-testid="title">{usePageTitle(path)}</span>;
}

function titleFor(path: string) {
  render(
    <ShellProvider value={data}>
      <Title path={path} />
    </ShellProvider>,
  );
  return screen.getByTestId("title").textContent;
}

describe("usePageTitle", () => {
  it("titles the landing page with the view's own name", () => {
    expect(titleFor("/sales/home")).toBe("Sale");
  });

  it("falls back to the view name when there is no second segment", () => {
    expect(titleFor("/sales")).toBe("Sale");
  });

  it("names the profile page", () => {
    expect(titleFor("/sales/profile")).toBe("Profile");
  });

  it("takes a module's label from the navigation set", () => {
    expect(titleFor("/sales/customers")).toBe("Customer");
  });

  it("uses the module label rather than the slug", () => {
    expect(titleFor("/sales/sale-orders")).toBe("Sales Order");
  });

  it("still titles a page that is not in this view's navigation", () => {
    // Reachable by URL, absent from the nav set: the slug is title-cased so the
    // page is never left with an empty heading.
    expect(titleFor("/sales/audit-log")).toBe("Audit Log");
  });

  it("is unaffected by a trailing slash", () => {
    expect(titleFor("/sales/customers/")).toBe("Customer");
  });
});

describe("useShell", () => {
  it("refuses to be used outside the provider", () => {
    function Orphan() {
      useShell();
      return null;
    }
    // React logs the thrown error; the assertion is that it throws at all.
    expect(() => render(<Orphan />)).toThrow(/useShell must be used inside ShellProvider/);
  });
});
