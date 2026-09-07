import { describe, expect, it } from "vitest";
import { VISIT_TABS, centreAction, visitTitle } from "./visitNav";

describe("the centre button", () => {
  it("offers to check in when nothing is open", () => {
    const action = centreAction(null);
    expect(action.label).toBe("Check in");
    expect(action.href).toBe("/visit/check-in");
  });

  it("offers to check out of the visit that is, and goes straight to it", () => {
    // The whole reason `visits_one_open_per_person` exists: there is one answer,
    // so the button never has to ask which visit is meant.
    const action = centreAction("v1");
    expect(action.label).toBe("Check out");
    expect(action.href).toBe("/visit/visits/v1");
  });
});

describe("what the title bar says", () => {
  it("names the app on the dashboard, and the tab everywhere else", () => {
    expect(visitTitle("/visit/home")).toBe("My Visit");
    expect(visitTitle("/visit/report")).toBe("Report");
  });

  it("says 'Check in' rather than title-casing the URL into 'Check In'", () => {
    expect(visitTitle("/visit/check-in")).toBe("Check in");
  });

  it("names a visit record, id and all", () => {
    expect(visitTitle("/visit/visits/8f0a")).toBe("Visit");
  });

  it("falls back rather than showing nothing", () => {
    expect(visitTitle("/visit/somewhere-else")).toBe("Somewhere Else");
    expect(visitTitle("/visit")).toBe("My Visit");
  });

  it("has a title for every tab in the bar", () => {
    for (const tab of VISIT_TABS) {
      expect(visitTitle(tab.href)).toBe(tab.title);
    }
  });
});
