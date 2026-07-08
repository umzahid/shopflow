import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "./Toast";

type Variant = "success" | "error" | "warning" | "info";

function FireToast({
  title,
  description,
  variant,
  durationMs,
  label = "Fire toast",
}: {
  title: string;
  description?: string;
  variant?: Variant;
  durationMs?: number;
  label?: string;
}) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => toast({ title, description, variant, durationMs })}
    >
      {label}
    </button>
  );
}

describe("Toast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a status toast with title and description when toast() is called", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <FireToast title="Order placed" description="We emailed your receipt." />
      </ToastProvider>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fire toast" }));

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Order placed");
    expect(toast).toHaveTextContent("We emailed your receipt.");
  });

  it("applies the variant styling", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <FireToast title="Payment failed" variant="error" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Fire toast" }));

    expect(screen.getByRole("status")).toHaveClass("border-danger");
  });

  it("auto-dismisses after durationMs", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <FireToast title="Saved" durationMs={2000} />
      </ToastProvider>,
    );
    // fireEvent instead of userEvent: userEvent's internal delays deadlock
    // under fake timers.
    fireEvent.click(screen.getByRole("button", { name: "Fire toast" }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not auto-dismiss when durationMs is 0", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <FireToast title="Sticky" durationMs={0} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fire toast" }));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Sticky");
  });

  it("dismisses on the close button", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <FireToast title="Saved" durationMs={0} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Fire toast" }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows at most three toasts, dropping the oldest", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <FireToast title="First" durationMs={0} label="Fire first" />
        <FireToast title="Second" durationMs={0} label="Fire second" />
        <FireToast title="Third" durationMs={0} label="Fire third" />
        <FireToast title="Fourth" durationMs={0} label="Fire fourth" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Fire first" }));
    await user.click(screen.getByRole("button", { name: "Fire second" }));
    await user.click(screen.getByRole("button", { name: "Fire third" }));
    await user.click(screen.getByRole("button", { name: "Fire fourth" }));

    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.getByText("Fourth")).toBeInTheDocument();
  });
});
