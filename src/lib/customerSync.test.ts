import { describe, expect, it } from "vitest";
import {
  customerSyncProblem,
  guessPicks,
  guessSummary,
  headerKey,
  looksLikeProvinceCodes,
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
  provinceIsCode: false,
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

  it("decides an empty slot by the number, not the label beside it", () => {
    // The derived id exists whether or not anybody filled the slot in, so the
    // key check cannot tell an empty slot from a used one. The phone can:
    // most labels on a sheet like this are blank, and reading a blank label as
    // an empty slot threw away two thirds of the numbers.
    expect(one().require_column).toBe("phone");
  });

  it("and names the contact 'Phone 1' where the label column is empty", () => {
    // The NOT NULL column still has to be fed, and a worse name is a better
    // answer than a number nobody can import.
    const name = one().maps.find((m) => m.target_column === "name");
    expect(name?.transform).toBe("fallback");
    expect(name?.transform_arg).toBe("Phone 1");
    expect(name?.sheet_column).toBe("Label 1");
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

// The headers of the sheet this was built for, verbatim. A guesser tested only
// against headers invented for the test is a guesser tested against nothing.
const REAL_HEADERS = [
  "ID", "QBID", "NAME", "BIZ_TYPE", "PH1", "PH1L", "PH2", "PH2L", "PH3", "PH3L",
  "STREET", "COMMUNE", "DISTRICT", "PROVINCE_ID", "LANDMARK", "LAT/LONG",
  "REMARKS", "ASSIGN_TO", "ACTIVE", "CR", "CRTS", "MD", "MDTS",
  "PREFER_TRUCK_LIST", "PIC_ID", "CREDIT_LIMIT", "EXT_AR_DAY",
  "LAST_VISIT_DATE", "LAST_PURCHASE_DATE", "BIZ_TYPE_2", "ZIPCODE", "ZONE", "CLASS",
];

describe("reading a header for what it says", () => {
  it("throws away the punctuation people vary and keeps the words", () => {
    expect(headerKey("LAT/LONG")).toBe("lat long");
    expect(headerKey("BIZ_TYPE")).toBe("biz type");
    expect(headerKey("  Shop  Name ")).toBe("shop name");
  });
});

describe("the mapping the sheet already describes", () => {
  const guess = guessPicks(REAL_HEADERS);

  it("finds the column everything hangs off", () => {
    expect(guess.sheetIdColumn).toBe("ID");
  });

  it("and the plain fields", () => {
    expect(guess.fields.shop_name).toBe("NAME");
    expect(guess.fields.business_type).toBe("BIZ_TYPE");
    expect(guess.fields.street_address).toBe("STREET");
    expect(guess.fields.landmark).toBe("LANDMARK");
    expect(guess.fields.district_text).toBe("DISTRICT");
    expect(guess.fields.commune_text).toBe("COMMUNE");
    expect(guess.fields.zipcode).toBe("ZIPCODE");
    expect(guess.fields.remarks).toBe("REMARKS");
  });

  it("the one cell holding two coordinates", () => {
    expect(guess.locationColumn).toBe("LAT/LONG");
  });

  it("and the province, without mistaking its ID for its name", () => {
    expect(guess.provinceColumn).toBe("PROVINCE_ID");
    expect(guess.fields.province_text).toBeUndefined();
  });

  it("pairs each phone with the label beside it", () => {
    expect(guess.contacts).toEqual([
      { phone: "PH1", label: "PH1L" },
      { phone: "PH2", label: "PH2L" },
      { phone: "PH3", label: "PH3L" },
    ]);
  });

  // The failure that cost a whole run: QBID went to customers.code, which is
  // unique, and the sheet had two rows the database would not take together.
  it("never guesses the customer code", () => {
    expect(guess.fields.code).toBeUndefined();
  });

  // A near-miss is worse than a blank, because a blank is visible.
  it("and never mistakes a near-miss for the real column", () => {
    expect(Object.values(guess.fields)).not.toContain("BIZ_TYPE_2");
    expect(guess.sheetIdColumn).not.toBe("PIC_ID");
    expect(guess.contacts.map((c) => c.phone)).not.toContain("PH1L");
  });

  it("leaves what it does not recognise alone", () => {
    const claimed = [
      guess.sheetIdColumn, guess.locationColumn, guess.provinceColumn,
      ...Object.values(guess.fields),
      ...guess.contacts.flatMap((c) => [c.phone, c.label]),
    ];
    for (const header of ["ASSIGN_TO", "CREDIT_LIMIT", "ZONE", "CLASS", "QBID"]) {
      expect(claimed).not.toContain(header);
    }
  });

  it("and produces picks the builder is willing to create", () => {
    expect(customerSyncProblem({ ...picks(), ...guess })).toBeNull();
  });
});

describe("a sheet that says none of it", () => {
  const guess = guessPicks(["Col A", "Col B", "Col C"]);

  it("guesses nothing rather than something", () => {
    expect(guess.sheetIdColumn).toBe("");
    expect(guess.fields).toEqual({});
    expect(guess.locationColumn).toBe("");
    expect(guess.contacts.every((c) => c.phone === "" && c.label === "")).toBe(true);
  });

  it("and says so, so nobody waits for a form to fill itself in", () => {
    expect(guessSummary(guess, ["Col A", "Col B", "Col C"]))
      .toMatch(/none of these headers/i);
  });
});

describe("what the screen says about a guess", () => {
  it("counts the columns it filled in against the sheet's own", () => {
    expect(guessSummary(guessPicks(REAL_HEADERS), REAL_HEADERS))
      .toBe("Filled in from 17 of the sheet's 33 columns. Check them, and choose anything left over.");
  });
});

describe("whether a province column holds codes or IDs", () => {
  const codes = ["SRP", "PNH", "KKG", "BTB"];

  it("reads codes when the column is full of them", () => {
    expect(looksLikeProvinceCodes(["SRP", "PNH", "SRP", "BTB"], codes)).toBe(true);
  });

  it("and IDs when it is not", () => {
    expect(looksLikeProvinceCodes(["P-001", "P-002", "P-003"], codes)).toBe(false);
  });

  // Sheets have blanks and a stray typo; one bad cell must not send a whole
  // column down the path that silently writes no province at all.
  it("tolerates a blank and a typo", () => {
    expect(looksLikeProvinceCodes(["SRP", "", "PNH", "SRPP"], codes)).toBe(true);
  });

  it("case and spacing are not the question being asked", () => {
    expect(looksLikeProvinceCodes([" srp ", "pnh"], codes)).toBe(true);
  });

  it("and an empty column decides nothing, so it takes the safe reading", () => {
    expect(looksLikeProvinceCodes([], codes)).toBe(false);
    expect(looksLikeProvinceCodes(["SRP"], [])).toBe(false);
  });
});
