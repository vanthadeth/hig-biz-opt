import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { mockPathname } from "../../../vitest.setup";
import { VisitNav } from "./VisitNav";

describe("the visit bar", () => {
  it("has three buttons and no way to rearrange them", () => {
    mockPathname.current = "/visit/home";
    render(<VisitNav openVisitId={null} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    // The five-slot bar in the other views is customisable by holding a button.
    // This one is not, so nothing here invites the gesture.
    expect(screen.queryByTitle("Hold to change this button")).toBeNull();
  });

  it("says 'Check in' in the middle when no visit is open", () => {
    mockPathname.current = "/visit/home";
    render(<VisitNav openVisitId={null} />);

    const centre = screen.getByRole("link", { name: "Check in" });
    expect(centre).toHaveAttribute("href", "/visit/check-in");
  });

  it("says 'Check out' and points at the open visit when there is one", () => {
    mockPathname.current = "/visit/home";
    render(<VisitNav openVisitId="v1" />);

    const centre = screen.getByRole("link", { name: "Check out" });
    expect(centre).toHaveAttribute("href", "/visit/visits/v1");
    expect(screen.queryByRole("link", { name: "Check in" })).toBeNull();
  });

  it("marks the tab you are standing on, and only that one", () => {
    mockPathname.current = "/visit/report";
    render(<VisitNav openVisitId={null} />);

    expect(screen.getByRole("link", { name: "Report" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
