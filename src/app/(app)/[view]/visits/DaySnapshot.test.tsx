import { screen } from "@testing-library/react";
import { render } from "@/test/i18n";
import { describe, expect, it } from "vitest";
import { NO_QUOTA, type Quota } from "@/lib/quota";
import { DaySnapshot } from "./DaySnapshot";

const HOUR = 3_600_000;
const quota = (over: Partial<Quota> = {}): Quota => ({ ...NO_QUOTA, ...over });
const totals = (visits: number, workingMs: number, activeMs: number) =>
  ({ visits, workingMs, activeMs });

describe("the day against what it is supposed to be", () => {
  it("says both halves of the sentence on one line", () => {
    render(
      <DaySnapshot
        quota={quota({ daily_visit_target: 8, daily_working_hours: 8.5 })}
        today={totals(4, 3 * HOUR + 8 * 60_000, HOUR)}
        week={null}
      />,
    );

    expect(screen.getByText(/Visits · 4 of 8/)).toBeInTheDocument();
    expect(screen.getByText(/Working · 3h 8m of 8h 30m/)).toBeInTheDocument();
  });

  it("draws a bar for a measure and none for one nobody manages", () => {
    render(
      <DaySnapshot
        quota={quota({ daily_visit_target: 8 })}
        today={totals(4, 3 * HOUR, HOUR)}
        week={null}
      />,
    );

    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.queryByText(/Working ·/)).not.toBeInTheDocument();
  });

  it("shows nothing at all when nobody has decided anything", () => {
    const { container } = render(
      <DaySnapshot quota={NO_QUOTA} today={totals(4, 3 * HOUR, HOUR)} week={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // The bar is the shape; the figures beside it are the record. Clipping the
  // ninth call would hide the best thing that happened today.
  it("fills the bar at the target but keeps counting past it", () => {
    render(
      <DaySnapshot
        quota={quota({ daily_visit_target: 8 })}
        today={totals(9, 0, 0)}
        week={null}
      />,
    );

    expect(screen.getByText(/Visits · 9 of 8/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("draws a day nobody has started yet at nothing, not as missing", () => {
    render(
      <DaySnapshot quota={quota({ daily_visit_target: 8 })} today={null} week={null} />,
    );
    expect(screen.getByText(/Visits · 0 of 8/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("keeps the week its own section, on its own numbers", () => {
    render(
      <DaySnapshot
        quota={quota({ daily_visit_target: 8, weekly_visit_target: 44 })}
        today={totals(4, 0, 0)}
        week={totals(21, 0, 0)}
      />,
    );

    expect(screen.getByText("Today so far")).toBeInTheDocument();
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(screen.getByText(/Visits · 4 of 8/)).toBeInTheDocument();
    expect(screen.getByText(/Visits · 21 of 44/)).toBeInTheDocument();
  });
});
