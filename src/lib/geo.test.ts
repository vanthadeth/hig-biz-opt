import { describe, expect, it } from "vitest";

import { metresBetween } from "./geo";

/**
 * The numbers on the right were read off `app.metres_between` on the live
 * schema, not worked out here, and they are asserted to the millimetre.
 *
 * This haversine only ever sorts a list of shops before anybody checks in —
 * the distance that gets recorded is always the database's. But a list that
 * disagrees with the record it is about to produce is a list that puts the
 * wrong shop at the top, so the two are held to the same answer.
 */
describe("metresBetween", () => {
  it("is nothing when nothing moved", () => {
    expect(metresBetween(11.5, 104.9, 11.5, 104.9)).toBe(0);
  });

  it("agrees with the database to the millimetre, a hundred metres out", () => {
    expect(metresBetween(11.5564, 104.9282, 11.5573, 104.9282))
      .toBeCloseTo(100.075433980103, 3);
  });

  it("and eleven hundred", () => {
    expect(metresBetween(11.5, 104.9, 11.51, 104.9))
      .toBeCloseTo(1111.94926644559, 3);
  });

  it("and nine kilometres, out at the airport", () => {
    expect(metresBetween(11.5564, 104.9282, 11.5466, 104.8441))
      .toBeCloseTo(9226.65566279246, 3);
  });

  it("is the same in both directions", () => {
    expect(metresBetween(11.5564, 104.9282, 11.5466, 104.8441))
      .toBeCloseTo(metresBetween(11.5466, 104.8441, 11.5564, 104.9282), 6);
  });
});
