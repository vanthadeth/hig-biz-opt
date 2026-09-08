import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckInAction } from "./CheckInAction";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const rpc = vi.fn();
let rpcResult: { data: unknown; error: unknown } = { data: { id: "v9" }, error: null };
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

beforeEach(() => {
  push.mockClear();
  rpc.mockClear();
  rpcResult = { data: { id: "v9" }, error: null };
  fixResult = { fix: { latitude: 11.55, longitude: 104.9282, accuracy: 10 }, problem: null };
});

describe("checking in from the customer's own record", () => {
  it("calls check_in with this shop's id and the phone's position", async () => {
    render(<CheckInAction viewKey="sales" customerId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("check_in", {
        p_customer: "c1", p_latitude: 11.55, p_longitude: 104.9282,
      }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sales/visits/v9"));
  });

  it("works without a fix, just with no position sent", async () => {
    fixResult = { fix: null, problem: "Location is switched off for this site." };
    render(<CheckInAction viewKey="sales" customerId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("check_in", {
        p_customer: "c1", p_latitude: null, p_longitude: null,
      }));
  });

  it("reports what the database said when it refuses", async () => {
    rpcResult = { data: null, error: { message: "You are still checked in somewhere. Check out first." } };
    render(<CheckInAction viewKey="sales" customerId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "You are still checked in somewhere. Check out first.",
      ));
    expect(push).not.toHaveBeenCalled();
  });
});
