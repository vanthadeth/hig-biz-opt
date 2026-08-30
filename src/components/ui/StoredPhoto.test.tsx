import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoredPhoto } from "./StoredPhoto";

const createSignedUrl = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

beforeEach(() => {
  createSignedUrl.mockReset();
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://example.test/signed.jpg" },
  });
});

describe("StoredPhoto", () => {
  it("shows initials when there is no photo", () => {
    render(<StoredPhoto name="Sokha Chan" path={null} />);

    expect(screen.getByText("SC")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("shows initials first, then the photo once its URL is signed", async () => {
    // The space must not collapse and then jump while the URL is in flight.
    render(<StoredPhoto name="Sokha Chan" path="u1/photo.jpg" />);
    expect(screen.getByText("SC")).toBeInTheDocument();

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("src", "https://example.test/signed.jpg");
    expect(img).toHaveAttribute("alt", "Sokha Chan");
    expect(screen.queryByText("SC")).not.toBeInTheDocument();
  });

  it("signs the path it was given, with an expiry", () => {
    render(<StoredPhoto name="Sokha Chan" path="u1/photo.jpg" />);

    expect(createSignedUrl).toHaveBeenCalledWith("u1/photo.jpg", 3600);
  });

  it("stays on initials when the storage policy refuses", async () => {
    // Someone whose record the viewer may not read: the photo is hidden by the
    // same rule that hides the record, and the badge still renders.
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "denied" } });

    render(<StoredPhoto name="Sokha Chan" path="u1/photo.jpg" />);

    await waitFor(() => expect(createSignedUrl).toHaveBeenCalled());
    expect(screen.getByText("SC")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("takes its whole shape from className, rounding included", () => {
    // A rounded-2xl baked into the base would fight a caller wanting a circle,
    // and which won would depend on Tailwind's emit order.
    const { container } = render(
      <StoredPhoto name="Sokha Chan" path={null} className="size-8 rounded-full text-xs" />,
    );

    const badge = container.firstElementChild!;
    expect(badge.className).toContain("rounded-full");
    expect(badge.className).not.toContain("rounded-2xl");
  });

  it("does not show a stale photo when the path changes", async () => {
    const { rerender } = render(<StoredPhoto name="Sokha Chan" path="u1/a.jpg" />);
    await screen.findByRole("img");

    createSignedUrl.mockReturnValue(new Promise(() => {}));
    rerender(<StoredPhoto name="Sokha Chan" path="u1/b.jpg" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("SC")).toBeInTheDocument();
  });
});
