import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar, AvatarStack } from "./Avatar";

const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${i}`, name: `Person ${i}` }));

describe("Avatar", () => {
  it("shows two initials", () => {
    render(<Avatar name="Vantha Deth" />);
    expect(screen.getByText("VD")).toBeInTheDocument();
  });

  it("takes only the first two words of a longer name", () => {
    render(<Avatar name="Sok Chenda Vibol Chea" />);
    expect(screen.getByText("SC")).toBeInTheDocument();
  });

  it("falls back rather than rendering an empty circle", () => {
    render(<Avatar name="   " />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("prefers a photo when there is one", () => {
    render(<Avatar name="Vantha Deth" src="/avatars/v.jpg" />);
    expect(screen.getByAltText("Vantha Deth")).toBeInTheDocument();
  });
});

describe("AvatarStack", () => {
  it("shows everyone when they fit", () => {
    const { container } = render(<AvatarStack people={people(3)} max={4} />);
    expect(container.querySelectorAll("span[title]")).toHaveLength(3);
  });

  it("counts the remainder instead of drawing it", () => {
    render(<AvatarStack people={people(9)} max={4} />);
    expect(screen.getByText("+5")).toBeInTheDocument();
  });

  it("adds no counter at exactly the limit", () => {
    render(<AvatarStack people={people(4)} max={4} />);
    expect(screen.queryByText(/^\+/)).toBeNull();
  });
});
