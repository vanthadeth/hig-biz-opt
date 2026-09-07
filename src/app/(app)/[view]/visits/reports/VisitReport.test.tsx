import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReportVisit } from "@/lib/visits";
import { VisitReport } from "./VisitReport";

/**
 * Times carry their +07:00 offset so the day a call belongs to is legible
 * here, and `now` is a week past the last of them so nothing is still running.
 */
const NOW = "2026-09-14T12:00:00+07:00";

let n = 0;
const call = (
  userId: string, name: string, from: string, to: string | null,
  over: Partial<ReportVisit> = {},
): ReportVisit => ({
  id: `v${n++}`,
  user_id: userId,
  checked_in_at: `2026-09-${from}+07:00`,
  checked_out_at: to === null ? null : `2026-09-${to}+07:00`,
  in_latitude: 11.5564, in_longitude: 104.9282,
  distance_m: 90, out_of_range: false,
  user: { full_name: name },
  customer: { shop_name: "Corner Mart", latitude: 11.5564, longitude: 104.9282 },
  ...over,
});

// Tuesday the 1st and Thursday the 3rd, then the following Monday the 7th.
const SOKHA = [
  call("u1", "Sokha Chan", "01T08:00:00", "01T08:30:00"),
  call("u1", "Sokha Chan", "01T14:00:00", "01T15:00:00"),
  call("u1", "Sokha Chan", "03T09:00:00", "03T11:00:00"),
  call("u1", "Sokha Chan", "07T08:00:00", "07T09:00:00"),
];
const BOPHA = [call("u2", "Bopha Lim", "02T08:00:00", "02T08:45:00")];

describe("the report, day by day", () => {
  it("opens on days, newest first", () => {
    render(<VisitReport visits={SOKHA} now={NOW} />);

    const dates = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(dates[0]).toContain("Monday 7 September 2026");
    expect(dates[1]).toContain("Thursday 3 September 2026");
    expect(dates[2]).toContain("Tuesday 1 September 2026");
    expect(dates).toHaveLength(3); // days with visits, not the calendar
  });

  it("clocks in at the first check-in and out at the last check-out", () => {
    render(<VisitReport visits={SOKHA} now={NOW} />);

    const tuesday = screen.getByText("Tuesday 1 September 2026").closest("li")!;
    expect(within(tuesday).getByText("08:00 – 15:00")).toBeInTheDocument();
  });

  it("counts the whole span as working and only the shops as active", () => {
    render(<VisitReport visits={SOKHA} now={NOW} />);

    const tuesday = screen.getByText("Tuesday 1 September 2026").closest("li")!;
    // 08:00 to 15:00 is seven hours; 30 minutes plus an hour is inside shops.
    expect(within(tuesday).getByText("7h")).toBeInTheDocument();
    expect(within(tuesday).getByText("1h 30m")).toBeInTheDocument();
    expect(within(tuesday).getByText("2")).toBeInTheDocument();
  });

  it("marks a day somebody never checked out of rather than reporting it short", () => {
    render(
      <VisitReport
        visits={[...SOKHA, call("u1", "Sokha Chan", "09T08:00:00", null)]}
        now={NOW}
      />,
    );

    const day = screen.getByText("Wednesday 9 September 2026").closest("li")!;
    expect(within(day).getByText("Never checked out")).toBeInTheDocument();
    expect(within(day).getByText("— – —")).toBeInTheDocument();
  });
});

describe("rolled up", () => {
  it("gathers days into weeks, Monday to Sunday", () => {
    render(<VisitReport visits={SOKHA} now={NOW} />);
    fireEvent.click(screen.getByRole("tab", { name: "Week" }));

    const weeks = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(weeks[0]).toContain("7 Sept – 13 Sept");
    expect(weeks[1]).toContain("31 Aug – 6 Sept");
    // The 1st and the 3rd fall in the earlier week; the 7th starts the next.
    expect(weeks[1]).toContain("2 days worked");
    expect(weeks[1]).toContain("3 visits");
  });

  it("and weeks into months", () => {
    render(<VisitReport visits={SOKHA} now={NOW} />);
    fireEvent.click(screen.getByRole("tab", { name: "Month" }));

    const months = screen.getAllByRole("listitem");
    expect(months).toHaveLength(1);
    expect(months[0]).toHaveTextContent("September 2026");
    expect(months[0]).toHaveTextContent("3 days worked");
    expect(months[0]).toHaveTextContent("4 visits");
  });

  it("averages over the days worked, not over the calendar", () => {
    render(<VisitReport visits={SOKHA} now={NOW} />);
    fireEvent.click(screen.getByRole("tab", { name: "Month" }));

    // 7h + 2h + 1h over three days worked.
    const month = screen.getByText("September 2026").closest("li")!;
    expect(within(month).getByText("10h")).toBeInTheDocument();
    expect(within(month).getByText("3h 20m")).toBeInTheDocument();
  });

  it("says when a month contains a day nobody closed", () => {
    render(
      <VisitReport
        visits={[...SOKHA, call("u1", "Sokha Chan", "09T08:00:00", null)]}
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Month" }));
    expect(screen.getByText("A day was never closed")).toBeInTheDocument();
  });
});

describe("whose days", () => {
  it("offers no chooser when there is nobody to choose between", () => {
    render(<VisitReport visits={SOKHA} now={NOW} />);
    expect(screen.queryByLabelText("Employee")).toBeNull();
  });

  it("but does when more than one person's visits came back", () => {
    render(<VisitReport visits={[...SOKHA, ...BOPHA]} now={NOW} />);

    const picker = screen.getByLabelText("Employee");
    expect(within(picker).getAllByRole("option").map((o) => o.textContent))
      .toEqual(["Bopha Lim", "Sokha Chan"]);
  });

  it("and shows only the chosen person's days", () => {
    render(<VisitReport visits={[...SOKHA, ...BOPHA]} now={NOW} />);

    // Alphabetical, so Bopha is first and her one day is what shows.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Wednesday 2 September 2026")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Employee"), { target: { value: "u1" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("Wednesday 2 September 2026")).toBeNull();
  });

  it("names somebody whose employee record has gone rather than showing a uuid", () => {
    render(<VisitReport visits={[call("u9", "", "01T08:00:00", "01T09:00:00", { user: null })]}
      now={NOW} />);
    expect(screen.queryByText(/u9/)).toBeNull();
  });

  it("says so when there is nothing to report at all", () => {
    render(<VisitReport visits={[]} now={NOW} />);
    expect(screen.getByText(/No visits recorded in the last ninety days/))
      .toBeInTheDocument();
  });
});
