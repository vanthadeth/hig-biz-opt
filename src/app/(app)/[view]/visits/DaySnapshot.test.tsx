import { fireEvent, screen, within } from "@testing-library/react";
import { render } from "@/test/i18n";
import { describe, expect, it } from "vitest";
import { NO_QUOTA, type Quota } from "@/lib/quota";
import { DaySnapshot, hasSnapshot } from "./DaySnapshot";

const HOUR = 3_600_000;
const quota = (over: Partial<Quota> = {}): Quota => ({ ...NO_QUOTA, ...over });
const totals = (visits: number, workingMs = 0, activeMs = 0) => ({ visits, workingMs, activeMs });

describe("the day against what it is supposed to be", () => {
  it("draws a ring per managed figure, and none for the rest", () => {
    render(
      <DaySnapshot
        quota={quota({ daily_visit_target: 8, daily_working_hours: 8 })}
        today={totals(4, 3 * HOUR)}
        week={null}
      />,
    );

    expect(screen.getByText("50%")).toBeInTheDocument(); // 4 of 8 visits
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText(/Active/)).not.toBeInTheDocument();
  });

  it("shows the figures beside the ring, not only the share", () => {
    render(
      <DaySnapshot quota={quota({ daily_visit_target: 8 })} today={totals(4)} week={null} />,
    );
    expect(screen.getByText("/ 8")).toBeInTheDocument();
  });

  // The ring is the shape; the numbers are the record.
  it("fills the ring at the target and keeps counting past it", () => {
    render(
      <DaySnapshot quota={quota({ daily_visit_target: 8 })} today={totals(9)} week={null} />,
    );
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("is nothing at all where nobody has set a target", () => {
    const { container } = render(
      <DaySnapshot quota={NO_QUOTA} today={totals(4, 3 * HOUR)} week={null} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(hasSnapshot(NO_QUOTA)).toBe(false);
  });
});

describe("today and this week", () => {
  const both = quota({ daily_visit_target: 8, weekly_visit_target: 44 });

  it("offers one scope at a time, starting on today", () => {
    render(<DaySnapshot quota={both} today={totals(4)} week={totals(21)} />);
    expect(screen.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("/ 8")).toBeInTheDocument();
  });

  it("and switches to the week on a tap", () => {
    render(<DaySnapshot quota={both} today={totals(4)} week={totals(21)} />);
    fireEvent.click(screen.getByRole("tab", { name: "This week" }));
    expect(screen.getByText("/ 44")).toBeInTheDocument();
    expect(screen.queryByText("/ 8")).not.toBeInTheDocument();
  });

  // A tab that leads to an empty panel teaches people not to press it.
  it("offers no choice where only one scope is managed", () => {
    render(
      <DaySnapshot quota={quota({ daily_visit_target: 8 })} today={totals(4)} week={totals(21)} />,
    );
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("and falls back to the scope that exists when only the week is", () => {
    render(
      <DaySnapshot quota={quota({ weekly_visit_target: 44 })} today={totals(4)} week={totals(21)} />,
    );
    expect(screen.getByText("/ 44")).toBeInTheDocument();
  });
});

describe("collapsing on a tap, and only a tap", () => {
  const one = quota({ daily_visit_target: 8 });

  it("starts open", () => {
    render(<DaySnapshot quota={one} today={totals(4)} week={null} />);
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });

  it("shuts on a tap of its own header", () => {
    render(<DaySnapshot quota={one} today={totals(4)} week={null} />);
    fireEvent.click(screen.getByRole("button", { expanded: true }));
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
  });

  // Collapsed is smaller, not emptier: losing the number entirely would make
  // shutting it the same as not having a target at all.
  it("keeping the leading figure and its bar in the header", () => {
    render(<DaySnapshot quota={one} today={totals(4)} week={null} />);
    fireEvent.click(screen.getByRole("button", { expanded: true }));

    const header = screen.getByRole("button", { expanded: false });
    expect(within(header).getByText("4")).toBeInTheDocument();
    expect(within(header).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("and a second tap opens it again", () => {
    render(<DaySnapshot quota={one} today={totals(4)} week={null} />);
    fireEvent.click(screen.getByRole("button", { expanded: true }));
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });

  // Nothing here reads the scroll position any more: the card scrolls with the
  // rest of the page like any other, so there is no gesture to react to.
  it("does not react to the page scrolling", () => {
    render(<DaySnapshot quota={one} today={totals(4)} week={null} />);
    Object.defineProperty(window, "scrollY", { value: 900, writable: true, configurable: true });
    fireEvent.scroll(window);
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });
});

describe("a day nobody has started", () => {
  it("draws every managed figure at nothing, which is the truth at eight in the morning", () => {
    render(
      <DaySnapshot quota={quota({ daily_visit_target: 8 })} today={null} week={null} />,
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
