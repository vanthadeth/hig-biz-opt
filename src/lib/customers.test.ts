import { describe, expect, it } from "vitest";
import {
  addressLine,
  ageReceivables,
  AGEING_BUCKETS,
  communesIn,
  coordinateProblem,
  countCustomers,
  creditUsage,
  daysBetween,
  districtsIn,
  groupByProvince,
  mapHref,
  matchesCustomer,
  overCreditLimit,
  statusAction,
  statusActions,
  statusChange,
  statusProblem,
  parseCoordinate,
  telegramHref,
  type DirectoryCustomer,
} from "./customers";

const shop = (over: Partial<DirectoryCustomer> = {}): DirectoryCustomer => ({
  id: "c1",
  shop_name: "Dara Mini Mart",
  business_type: null,
  status: "active",
  owner_id: null,
  owner_name: null,
  street_address: null,
  landmark: null,
  zipcode: null,
  latitude: null,
  longitude: null,
  credit_limit_usd: null,
  last_visit_date: null,
  last_purchase_date: null,
  province_name: null,
  district_name: null,
  commune_name: null,
  province_code: null,
  district_code: null,
  commune_code: null,
  primary_contact_name: null,
  primary_contact_phone: null,
  primary_photo_path: null,
  contact_count: 0,
  ...over,
});

describe("addressLine", () => {
  it("reads street first, province last", () => {
    expect(
      addressLine({
        street_address: "St 271",
        commune_name: "Tonle Bassac",
        district_name: "Chamkar Mon",
        province_name: "Phnom Penh",
      }),
    ).toBe("St 271, Tonle Bassac, Chamkar Mon, Phnom Penh");
  });

  it("drops the parts that are missing rather than leaving empty commas", () => {
    expect(
      addressLine({
        street_address: null,
        commune_name: null,
        district_name: "Chamkar Mon",
        province_name: "Phnom Penh",
      }),
    ).toBe("Chamkar Mon, Phnom Penh");
  });

  it("is null when there is no address at all", () => {
    expect(
      addressLine({
        street_address: null,
        commune_name: null,
        district_name: null,
        province_name: null,
      }),
    ).toBeNull();
  });

  it("ignores a field that holds only spaces", () => {
    expect(
      addressLine({
        street_address: "   ",
        commune_name: null,
        district_name: null,
        province_name: "Kampot",
      }),
    ).toBe("Kampot");
  });
});

describe("mapHref", () => {
  it("links to the pin when the shop has one", () => {
    expect(mapHref({ latitude: 11.5564, longitude: 104.9282 })).toContain(
      "11.5564,104.9282",
    );
  });

  it("is null when the shop has never been pinned", () => {
    expect(mapHref({ latitude: null, longitude: null })).toBeNull();
  });
});

describe("telegramHref", () => {
  it("drops the @, which is display and not part of the link", () => {
    expect(telegramHref("@dara")).toBe("https://t.me/dara");
    expect(telegramHref("dara")).toBe("https://t.me/dara");
  });

  it("is null when there is no handle", () => {
    expect(telegramHref(null)).toBeNull();
  });
});

describe("matchesCustomer", () => {
  const mart = shop({
    shop_name: "Dara Mini Mart",
    business_type: "Grocery",
    primary_contact_name: "Sok Dara",
    primary_contact_phone: "012 345 678",
    owner_name: "Field Rep",
    landmark: "Opposite the pagoda",
    province_name: "Phnom Penh",
  });

  it("matches everything on an empty query", () => {
    expect(matchesCustomer(mart, "")).toBe(true);
    expect(matchesCustomer(mart, "  ")).toBe(true);
  });

  it("matches the shop name, ignoring case", () => {
    expect(matchesCustomer(mart, "MINI")).toBe(true);
  });

  it("matches the person you would actually ring", () => {
    expect(matchesCustomer(mart, "sok dara")).toBe(true);
    expect(matchesCustomer(mart, "012")).toBe(true);
  });

  it("matches where it is, including the landmark", () => {
    // A rep looking for a shop remembers the pagoda, not the street number.
    expect(matchesCustomer(mart, "pagoda")).toBe(true);
    expect(matchesCustomer(mart, "phnom penh")).toBe(true);
  });

  it("matches the rep whose account it is", () => {
    expect(matchesCustomer(mart, "field rep")).toBe(true);
  });

  it("does not match something absent", () => {
    expect(matchesCustomer(mart, "battambang")).toBe(false);
  });

  it("survives a shop with nothing but a name", () => {
    expect(matchesCustomer(shop({ shop_name: "Bare" }), "bare")).toBe(true);
    expect(matchesCustomer(shop({ shop_name: "Bare" }), "pagoda")).toBe(false);
  });
});

describe("groupByProvince", () => {
  const rows = [
    shop({ id: "a", shop_name: "Zeta Shop", province_code: "12", province_name: "Phnom Penh" }),
    shop({ id: "b", shop_name: "Alpha Shop", province_code: "12", province_name: "Phnom Penh" }),
    shop({ id: "c", shop_name: "Kampot Shop", province_code: "07", province_name: "Kampot" }),
    shop({ id: "d", shop_name: "Nowhere Shop" }),
  ];

  it("groups by province and sorts the shops inside each", () => {
    const groups = groupByProvince(rows);
    const pp = groups.find((g) => g.name === "Phnom Penh");
    expect(pp?.customers.map((c) => c.shop_name)).toEqual(["Alpha Shop", "Zeta Shop"]);
  });

  it("puts shops with no province last, whatever the name", () => {
    expect(groupByProvince(rows).at(-1)?.name).toBe("No province set");
  });

  it("filters across the groups rather than flattening them", () => {
    const groups = groupByProvince(rows, "kampot");
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Kampot");
    expect(countCustomers(groups)).toBe(1);
  });

  it("groups a typed province that has no code yet", () => {
    // Before the district import, a province may be text only. It still heads
    // its own group rather than falling in with the unplaced.
    const groups = groupByProvince([shop({ province_name: "Kampot" })]);
    expect(groups[0].name).toBe("Kampot");
    expect(groups[0].key).not.toBe("unplaced");
  });

  it("comes back empty when nothing matches", () => {
    expect(groupByProvince(rows, "nothing here")).toEqual([]);
    expect(countCustomers([])).toBe(0);
  });
});

describe("districtsIn / communesIn", () => {
  const districts = [
    { code: "1201", province_code: "12", name_en: "Chamkar Mon", name_km: null },
    { code: "1202", province_code: "12", name_en: "Doun Penh", name_km: null },
    { code: "0801", province_code: "08", name_en: "Kandal Stueng", name_km: null },
  ];

  it("offers only the districts of the chosen province", () => {
    expect(districtsIn(districts, "12").map((d) => d.code)).toEqual(["1201", "1202"]);
  });

  it("offers nothing for a province with none imported", () => {
    expect(districtsIn(districts, "07")).toEqual([]);
  });

  it("does the same for communes under a district", () => {
    const communes = [
      { code: "120101", district_code: "1201", name_en: "Tonle Bassac", name_km: null },
      { code: "120201", district_code: "1202", name_en: "Chey Chumneas", name_km: null },
    ];
    expect(communesIn(communes, "1201").map((c) => c.code)).toEqual(["120101"]);
  });
});

describe("parseCoordinate", () => {
  it("reads a plain coordinate", () => {
    expect(parseCoordinate("11.5564", 90)).toBe(11.5564);
    expect(parseCoordinate("104.9282", 180)).toBe(104.9282);
  });

  it("accepts a negative one, unlike a price", () => {
    expect(parseCoordinate("-33.8688", 90)).toBe(-33.8688);
  });

  it("treats an empty box as no coordinate", () => {
    expect(parseCoordinate("", 90)).toBeNull();
    expect(parseCoordinate("   ", 90)).toBeNull();
  });

  it("rejects what is out of range for its axis", () => {
    expect(parseCoordinate("91", 90)).toBeUndefined();
    expect(parseCoordinate("104.9282", 90)).toBeUndefined();
    expect(parseCoordinate("181", 180)).toBeUndefined();
  });

  it("rejects what is not a number", () => {
    expect(parseCoordinate("north", 90)).toBeUndefined();
    expect(parseCoordinate("-", 90)).toBeUndefined();
    expect(parseCoordinate("11.5.5", 90)).toBeUndefined();
  });
});

describe("coordinateProblem", () => {
  it("is silent on a good pair", () => {
    expect(coordinateProblem("11.5564", "104.9282")).toBeNull();
  });

  it("is silent when both are empty", () => {
    expect(coordinateProblem("", "")).toBeNull();
  });

  it("refuses half a coordinate", () => {
    // The database refuses it too; this just says so before the round trip.
    expect(coordinateProblem("11.5564", "")).toContain("both numbers");
    expect(coordinateProblem("", "104.9282")).toContain("both numbers");
  });

  it("names which axis is wrong", () => {
    expect(coordinateProblem("95", "104")).toContain("latitude");
    expect(coordinateProblem("11", "999")).toContain("longitude");
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
  });

  it("is negative before the date", () => {
    expect(daysBetween("2026-02-10", "2026-02-01")).toBe(-9);
  });

  it("crosses a month and a year without drifting", () => {
    expect(daysBetween("2025-12-25", "2026-01-05")).toBe(11);
  });
});

describe("ageReceivables", () => {
  const asOf = "2026-06-30";

  it("puts nothing overdue in Current", () => {
    // Due today or later is not late.
    const aged = ageReceivables(
      [
        { due_date: "2026-06-30", outstanding_usd: 100 },
        { due_date: "2026-07-15", outstanding_usd: 50 },
      ],
      asOf,
    );
    expect(aged.buckets[0]).toEqual({ key: "current", label: "Current", amount: 150 });
    expect(aged.overdue).toBe(0);
    expect(aged.total).toBe(150);
  });

  it("lands each invoice in the bucket its age says", () => {
    const aged = ageReceivables(
      [
        { due_date: "2026-06-29", outstanding_usd: 10 }, // 1 day
        { due_date: "2026-05-31", outstanding_usd: 20 }, // 30 days
        { due_date: "2026-05-30", outstanding_usd: 40 }, // 31 days
        { due_date: "2026-04-01", outstanding_usd: 80 }, // 90 days
        { due_date: "2026-03-31", outstanding_usd: 160 }, // 91 days
      ],
      asOf,
    );
    const byKey = Object.fromEntries(aged.buckets.map((b) => [b.key, b.amount]));
    expect(byKey.d1_30).toBe(30);
    expect(byKey.d31_60).toBe(40);
    expect(byKey.d61_90).toBe(80);
    expect(byKey.d90_plus).toBe(160);
  });

  it("counts every bucket but Current as overdue", () => {
    const aged = ageReceivables(
      [
        { due_date: "2026-07-30", outstanding_usd: 100 },
        { due_date: "2026-06-01", outstanding_usd: 25 },
      ],
      asOf,
    );
    expect(aged.overdue).toBe(25);
    expect(aged.total).toBe(125);
  });

  it("always reports every bucket, so the table has no gaps", () => {
    const aged = ageReceivables([], asOf);
    expect(aged.buckets.map((b) => b.key)).toEqual(AGEING_BUCKETS.map((b) => b.key));
    expect(aged.buckets.every((b) => b.amount === 0)).toBe(true);
    expect(aged.total).toBe(0);
  });

  it("adds money without the drift that floats give you", () => {
    // 0.1 + 0.2 is the classic; a statement that reads 0.30000000000000004 is
    // not a statement.
    const aged = ageReceivables(
      [
        { due_date: "2026-06-01", outstanding_usd: 0.1 },
        { due_date: "2026-06-01", outstanding_usd: 0.2 },
      ],
      asOf,
    );
    expect(aged.total).toBe(0.3);
  });

  it("does not shift a bucket with the reader's timezone", () => {
    // asOf is passed in rather than read from the clock, so the same invoice
    // ages identically on the server and in a browser in another timezone.
    const invoice = [{ due_date: "2026-05-31", outstanding_usd: 5 }];
    expect(ageReceivables(invoice, "2026-06-30").buckets[1].amount).toBe(5);
    expect(ageReceivables(invoice, "2026-06-30").buckets[2].amount).toBe(0);
  });
});

describe("creditUsage", () => {
  it("is the fraction of the limit used", () => {
    expect(creditUsage(250, 1000)).toBe(0.25);
  });

  it("is null when no limit has been set", () => {
    // Nobody has decided, which is not the same as a limit of zero.
    expect(creditUsage(250, null)).toBeNull();
  });

  it("treats a zero limit as cash only", () => {
    expect(creditUsage(0, 0)).toBe(0);
    expect(creditUsage(1, 0)).toBe(1);
  });

  it("does not run past full when the balance is over the limit", () => {
    expect(creditUsage(2000, 1000)).toBe(1);
  });

  it("does not go negative on a credit balance", () => {
    expect(creditUsage(-50, 1000)).toBe(0);
  });
});

describe("overCreditLimit", () => {
  it("is true only past the limit", () => {
    expect(overCreditLimit(1001, 1000)).toBe(true);
    expect(overCreditLimit(1000, 1000)).toBe(false);
  });

  it("is false when there is no limit to be over", () => {
    expect(overCreditLimit(99999, null)).toBe(false);
  });
});

describe("statusActions", () => {
  it("never offers a move to the status the shop is already in", () => {
    for (const current of ["active", "inactive", "banned"] as const) {
      const targets = statusActions(current).map((a) => a.target);
      expect(targets).not.toContain(current);
      expect(targets).toHaveLength(2);
    }
  });

  it("offers reactivating from both of the other two", () => {
    expect(statusActions("banned").map((a) => a.target)).toContain("active");
    expect(statusActions("inactive").map((a) => a.target)).toContain("active");
  });

  it("names each action with the word that goes on the button", () => {
    expect(statusAction("banned").label).toBe("Ban");
    expect(statusAction("inactive").label).toBe("Mark inactive");
    expect(statusAction("active").label).toBe("Reactivate");
  });

  it("marks only banning as destructive", () => {
    expect(statusAction("banned").danger).toBe(true);
    expect(statusAction("inactive").danger).toBe(false);
    expect(statusAction("active").danger).toBe(false);
  });

  it("says what each move does, naming the shop", () => {
    expect(statusAction("banned").describe("Dara Mini Mart")).toContain("Dara Mini Mart");
    expect(statusAction("inactive").describe("Dara Mini Mart")).toContain("history");
  });
});

describe("statusProblem", () => {
  it("demands a reason for a ban, as the CHECK constraint does", () => {
    expect(statusProblem("banned", "")).toContain("why");
    expect(statusProblem("banned", "   ")).toContain("why");
    expect(statusProblem("banned", "Cheques returned twice")).toBeNull();
  });

  it("does not demand one for the other moves", () => {
    expect(statusProblem("inactive", "")).toBeNull();
    expect(statusProblem("active", "")).toBeNull();
  });
});

describe("statusChange", () => {
  it("writes the status and the reason", () => {
    expect(statusChange("banned", "Cheques returned twice")).toEqual({
      status: "banned",
      status_note: "Cheques returned twice",
    });
  });

  it("clears the note on coming back to active", () => {
    // A stale "cheques returned twice" on a reinstated shop reads as though it
    // were still true.
    expect(statusChange("active", "Paid up")).toEqual({
      status: "active",
      status_note: null,
    });
  });

  it("treats an empty note as no note rather than as an empty string", () => {
    expect(statusChange("inactive", "   ")).toEqual({
      status: "inactive",
      status_note: null,
    });
  });

  it("trims what it stores", () => {
    expect(statusChange("banned", "  Cheques bounced  ").status_note).toBe(
      "Cheques bounced",
    );
  });
});
