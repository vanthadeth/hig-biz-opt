import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ShellData } from "./ShellContext";
import { usePageTitle } from "./ShellContext";

// The bars are stubbed because what is under test is which of them render, not
// what they draw. Real ones would drag in the router and say nothing extra.
vi.mock("./SideNav", () => ({ SideNav: () => <nav data-testid="side" /> }));
vi.mock("./TitleBar", () => ({ TitleBar: () => <header data-testid="title" /> }));
vi.mock("./BottomNav", () => ({ BottomNav: () => <nav data-testid="bottom" /> }));
vi.mock("@/components/motion/RouteTransition", () => ({
  RouteTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { AppShell } = await import("./AppShell");

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
      module_key: "product",
      name: "Product",
      icon: "box",
      href: "products",
      sort_order: 1,
      group_name: "Selling",
    },
  ],
  modules: [],
  permissions: [],
};

/** Stands in for a real page: every one of them asks the shell for its title. */
function Page() {
  return <h1>{usePageTitle("/sales/products")}</h1>;
}

describe("AppShell", () => {
  it("renders the navigation and the page", () => {
    render(
      <AppShell data={data}>
        <Page />
      </AppShell>,
    );

    expect(screen.getByTestId("side")).toBeInTheDocument();
    expect(screen.getByTestId("title")).toBeInTheDocument();
    expect(screen.getByTestId("bottom")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Product" })).toBeInTheDocument();
  });

  it("locked, renders the page and no navigation at all", () => {
    // The regression: the kiosk branch used to drop the provider along with the
    // bars, and `usePageTitle` throws without one — so the catalogue, the one
    // page kiosk mode exists for, failed to load.
    render(
      <AppShell data={data} locked>
        <Page />
      </AppShell>,
    );

    expect(screen.queryByTestId("side")).toBeNull();
    expect(screen.queryByTestId("title")).toBeNull();
    expect(screen.queryByTestId("bottom")).toBeNull();
    expect(screen.getByRole("heading", { name: "Product" })).toBeInTheDocument();
  });
});
