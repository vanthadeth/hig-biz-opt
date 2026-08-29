import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

function open(onClose = vi.fn()) {
  // A transformed wrapper stands in for the title bar and the bottom bar, both
  // of which slide themselves away and so would capture a `fixed` descendant.
  const { container } = render(
    <div style={{ transform: "translateY(0)" }} data-testid="bar">
      <Sheet open onClose={onClose} title="Notifications">
        <p>Nothing to read yet.</p>
      </Sheet>
    </div>,
  );
  return { container, onClose };
}

describe("Sheet", () => {
  it("renders nothing while closed", () => {
    render(
      <Sheet open={false} onClose={vi.fn()} title="Notifications">
        <p>Nothing to read yet.</p>
      </Sheet>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("escapes its transformed ancestor by rendering into the body", () => {
    // The regression this guards: left in place, `fixed inset-0` resolves
    // against the transformed bar rather than the viewport, and the sheet
    // anchors to the title bar instead of the bottom of the screen.
    const { container } = open();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(container.querySelector('[data-testid="bar"]')).toBeEmptyDOMElement();
    expect(dialog.closest('[data-testid="bar"]')).toBeNull();
    expect(document.body).toContainElement(dialog);
  });

  it("labels the dialog and shows its children", () => {
    open();

    expect(screen.getByRole("dialog")).toHaveAttribute(
      "aria-label",
      "Notifications",
    );
    expect(screen.getByText("Nothing to read yet.")).toBeInTheDocument();
  });

  it("closes on the backdrop and on Escape", () => {
    const { onClose } = open();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("stops the page scrolling underneath, and restores it on close", () => {
    const { container } = render(
      <Sheet open onClose={vi.fn()} title="Notifications">
        <p>Nothing to read yet.</p>
      </Sheet>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    render(
      <Sheet open={false} onClose={vi.fn()} title="Notifications">
        <p>Nothing to read yet.</p>
      </Sheet>,
      { container },
    );
    expect(document.body.style.overflow).toBe("");
  });
});
