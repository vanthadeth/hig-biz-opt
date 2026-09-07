import { describe, expect, it } from "vitest";
import {
  customerSyncProblem,
  planCustomerSync,
  planSummary,
  type CustomerSyncPicks,
} from "./customerSync";

const picks = (over: Partial<CustomerSyncPicks> = {}): CustomerSyncPicks => ({
  spreadsheetId: "abc",
  tab: "Customers",
  headerRow: 1,
  sheetIdColumn: "ID",
  fields: { shop_name: "Shop", code: "Code" },
  locationColumn: "Location",
  provinceColumn: "Province ID",
  contacts: [
    { phone: "Phone 1", label: "Label 1" },
    { phone: "Phone 2", label: "Label 2" },
    { phone: "Phone 3", label: "Label 3" },
  ],
  intervalMinutes: 60,
  ...over,
});

const find = (planned: ReturnType<typeof planCustomerSync>, name: string) =>
  planned.find((p) => p.name === name)!;

describe("planning the customer sync", () => {
  it("makes one sync for the customer and one per phone", () => {
    // Not one sync with three phones in it: a sync maps a sheet column to a
    // target column, and "Phone 1" and "Phone 2" are different columns feeding
    // the same one.
    const planned = planCustomerSync(picks());
    expect(planned.map((p) => p.name)).toEqual([
      "Customers",
      "Customer phone 1",
      "Customer phone 2",
      "Customer phone 3",
    ]);
  });

  it("puts the customer first, because the phones resolve through it", () => {
    expect(planCustomerSync(picks())[0].target_table).toBe("customers");
  });

  it("leaves out a phone slot nobody uses", () => {
    const planned = planCustomerSync(
      picks({ contacts: [{ phone: "Phone 1", label: "Label 1" }, { phone: "", label: "" }] }),
    );
    expect(planned).toHaveLength(2);
  });

  it("splits the one location cell into two columns", () => {
    const maps = find(planCustomerSync(picks()), "Customers").maps;
    const location = maps.filter((m) => m.sheet_column === "Location");

    expect(location.map((m) => [m.target_column, m.transform])).toEqual([
      ["latitude", "latitude"],
      ["longitude", "longitude"],
    ]);
    // Read as a number, not as text: the columns are numeric.
    expect(location.every((m) => m.value_kind === "number")).toBe(true);
  });

  it("resolves the province through its own tab rather than storing an id", () => {
    const maps = find(planCustomerSync(picks()), "Customers").maps;
    const province = maps.find((m) => m.target_column === "province_code")!;
    expect(province.reference_table).toBe("geo_provinces");
  });

  it("gives every customer row the sheet's own id, so a rerun updates", () => {
    const maps = find(planCustomerSync(picks()), "Customers").maps;
    expect(maps[0]).toMatchObject({ sheet_column: "ID", target_column: "sheet_id" });
  });

  it("maps only the plain fields somebody actually chose", () => {
    const maps = find(planCustomerSync(picks()), "Customers").maps;
    const targets = maps.map((m) => m.target_column);
    expect(targets).toContain("shop_name");
    expect(targets).toContain("code");
    expect(targets).not.toContain("remarks");
  });
});

describe("planning one phone", () => {
  const one = () => find(planCustomerSync(picks()), "Customer phone 1");

  it("hangs the contact off its customer by reference", () => {
    const link = one().maps.find((m) => m.target_column === "customer_id")!;
    expect(link).toMatchObject({ sheet_column: "ID", reference_table: "customers" });
  });

  it("derives an identity from the customer's, so a rerun rewrites it", () => {
    // A phone sitting in its customer's row has no id of its own; without this
    // a second run would insert it again rather than update it.
    const id = one().maps.find((m) => m.target_column === "sheet_id")!;
    expect(id).toMatchObject({ transform: "suffix", transform_arg: "#1" });
  });

  it("keeps the three slots apart", () => {
    const planned = planCustomerSync(picks());
    const suffixes = planned
      .slice(1)
      .map((p) => p.maps.find((m) => m.target_column === "sheet_id")!.transform_arg);
    expect(suffixes).toEqual(["#1", "#2", "#3"]);
  });

  it("takes the label as the contact's name and the phone as the phone", () => {
    const byTarget = Object.fromEntries(
      one().maps.map((m) => [m.target_column, m.sheet_column]),
    );
    expect(byTarget.name).toBe("Label 1");
    expect(byTarget.phone).toBe("Phone 1");
  });

  it("skips a row whose label is blank rather than failing the run", () => {
    // The name column is NOT NULL, and the derived id exists whether or not
    // anybody filled the slot in, so the key check cannot tell the difference.
    expect(one().require_column).toBe("name");
  });

  it("asks nothing of the customer sync itself", () => {
    expect(find(planCustomerSync(picks()), "Customers").require_column).toBeNull();
  });
});

describe("what the builder refuses to create", () => {
  it("needs a customer id to hang everything off", () => {
    expect(customerSyncProblem(picks({ sheetIdColumn: "" }))).toMatch(/customer's ID/);
  });

  it("needs a shop name, because the column is required", () => {
    expect(customerSyncProblem(picks({ fields: {} }))).toMatch(/shop name/);
  });

  it("needs a label beside every phone it is given", () => {
    const problem = customerSyncProblem(
      picks({ contacts: [{ phone: "Phone 1", label: "" }] }),
    );
    expect(problem).toMatch(/labels it/);
  });

  it("does not mind a slot left entirely empty", () => {
    expect(
      customerSyncProblem(picks({ contacts: [{ phone: "", label: "" }] })),
    ).toBeNull();
  });

  it("needs a spreadsheet and a tab", () => {
    expect(customerSyncProblem(picks({ spreadsheetId: "" }))).toMatch(/spreadsheet/);
    expect(customerSyncProblem(picks({ tab: "" }))).toMatch(/tab/);
  });

  it("is happy with a full set of picks", () => {
    expect(customerSyncProblem(picks())).toBeNull();
  });
});

describe("what the button says it will do", () => {
  it("counts the phones", () => {
    expect(planSummary(planCustomerSync(picks()))).toBe(
      "4 syncs: customers, and 3 for the phones.",
    );
  });

  it("says so plainly when there are none", () => {
    expect(planSummary(planCustomerSync(picks({ contacts: [] })))).toBe(
      "One sync: customers.",
    );
  });
});
