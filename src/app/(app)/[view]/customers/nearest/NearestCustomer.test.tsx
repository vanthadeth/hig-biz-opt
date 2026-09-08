import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartCustomer } from "@/lib/catalog";
import { NearestCustomer } from "./NearestCustomer";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const rpc = vi.fn();
let rpcResult: { data: unknown; error: unknown } = {
  data: { id: "v9" },
  error: null,
};
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async (name: string, args: unknown) => {
      rpc(name, args);
      return rpcResult;
    },
  }),
}));

let fixResult: { fix: { latitude: number; longitude: number; accuracy: number | null } | null; problem: string | null } = {
  fix: { latitude: 11.55, longitude: 104.9282, accuracy: 10 },
  problem: null,
};
vi.mock("../../visits/useFix", () => ({ useFix: () => fixResult }));

const NOW = "2026-09-07T04:00:00Z";

const shop = (id: string, name: string, latOffset: number): CartCustomer => ({
  id,
  shop_name: name,
  street_address: "Street 1",
  province_text: "Phnom Penh",
  district_text: "Chamkarmon",
  latitude: 11.55 + latOffset,
  longitude: 104.9282,
});

const CUSTOMERS: CartCustomer[] = [
  shop("c1", "Closest Mart", 0.0005),
  shop("c2", "Second Grocer", 0.001),
  shop("c3", "Third Shop", 0.002),
  shop("c4", "Fourth Shop", 0.003),
  shop("c5", "Fifth Shop", 0.004),
  shop("c6", "Sixth Shop", 0.005),
];

const draw = (
  customers: CartCustomer[] = CUSTOMERS,
  lastVisits: [string, string][] = [],
) => render(<NearestCustomer viewKey="sales" customers={customers} lastVisits={lastVisits} now={NOW} />);

beforeEach(() => {
  push.mockClear();
  rpc.mockClear();
  rpcResult = { data: { id: "v9" }, error: null };
  fixResult = { fix: { latitude: 11.55, longitude: 104.9282, accuracy: 10 }, problem: null };
});

describe("the five closest shops", () => {
  it("shows exactly five, nearest first", () => {
    draw();
    const links = screen.getAllByRole("link").filter((l) => l.textContent?.includes("Shop") || l.textContent?.includes("Mart") || l.textContent?.includes("Grocer"));
    const names = links.map((l) => l.textContent ?? "");
    expect(names[0]).toContain("Closest Mart");
    expect(names.some((n) => n.includes("Sixth Shop"))).toBe(false);
  });

  it("falls back to alphabetical order without a position", () => {
    fixResult = { fix: null, problem: "Location is switched off for this site." };
    draw();
    expect(screen.getByText(/Location is switched off/)).toBeInTheDocument();
    expect(screen.getByText("Closest Mart")).toBeInTheDocument();
  });

  it("says there is nothing to show when the customer list is empty", () => {
    draw([]);
    expect(screen.getByText("No shops to look up yet.")).toBeInTheDocument();
  });
});

describe("the balance slot", () => {
  it("shows a dash rather than a number or a zero", () => {
    draw();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("how long since the shop was last called on", () => {
  it("says never, when there is no visit on record", () => {
    draw();
    expect(screen.getAllByText("Never visited").length).toBeGreaterThan(0);
  });

  it("says today for a visit earlier the same calendar day", () => {
    draw(CUSTOMERS, [["c1", "2026-09-07T01:00:00Z"]]);
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("counts whole calendar days back otherwise", () => {
    draw(CUSTOMERS, [["c1", "2026-09-01T04:00:00Z"]]);
    expect(screen.getByText("6d ago")).toBeInTheDocument();
  });
});

describe("checking in from the list", () => {
  it("checks in at the shop tapped, by id, with the phone's position", async () => {
    draw();
    fireEvent.click(screen.getAllByRole("button", { name: "Check in" })[0]);

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("check_in", {
        p_customer: "c1", p_latitude: 11.55, p_longitude: 104.9282,
      }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sales/visits/v9"));
  });

  it("reports what the database said when it is refused", async () => {
    rpcResult = { data: null, error: { message: "You are still checked in somewhere. Check out first." } };
    draw();
    fireEvent.click(screen.getAllByRole("button", { name: "Check in" })[0]);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "You are still checked in somewhere. Check out first.",
      ));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("tapping the row itself", () => {
  it("opens the real customer record", () => {
    draw();
    const link = screen.getByRole("link", { name: /Closest Mart/ });
    expect(link).toHaveAttribute("href", "/sales/customers/c1");
  });
});
