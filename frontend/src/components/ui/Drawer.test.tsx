import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Drawer } from "./Drawer";

describe("Drawer", () => {
  it("does not render when closed", () => {
    render(
      <Drawer open={false} onClose={() => {}} title="Cart">
        contents
      </Drawer>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders an accessible dialog with the title when open", () => {
    render(
      <Drawer open onClose={() => {}} title="Your Cart">
        contents
      </Drawer>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Your Cart")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Cart">
        contents
      </Drawer>,
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when ESC is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Cart">
        contents
      </Drawer>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Cart">
        contents
      </Drawer>,
    );
    // The backdrop is the presentation div wrapping the dialog panel.
    // Clicking the dialog panel itself should NOT close; click outside it.
    const backdrop = screen
      .getByRole("dialog")
      .closest('[role="presentation"]') as HTMLElement;
    // Click the backdrop element directly (not the inner panel)
    await user.pointer({ keys: "[MouseLeft]", target: backdrop });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders footer content when provided", () => {
    render(
      <Drawer
        open
        onClose={() => {}}
        title="Cart"
        footer={<button>Checkout</button>}
      >
        contents
      </Drawer>,
    );
    expect(
      screen.getByRole("button", { name: "Checkout" }),
    ).toBeInTheDocument();
  });
});
