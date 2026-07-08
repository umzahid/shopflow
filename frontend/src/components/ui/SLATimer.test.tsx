import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SLATimer } from "./SLATimer";

const NOW = new Date("2026-07-08T12:00:00Z");

function inMs(ms: number): Date {
  return new Date(NOW.getTime() + ms);
}

describe("SLATimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the remaining time for a comfortable deadline", () => {
    render(<SLATimer deadline={inMs(3 * 60 * 60_000)} />);

    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("3h 0m");
    expect(timer).toHaveAttribute("aria-live", "off");
    expect(timer).toHaveClass("text-foreground");
  });

  it("renders the prefix before the countdown", () => {
    render(<SLATimer deadline={inMs(2 * 60 * 60_000)} prefix="Ships in" />);

    expect(screen.getByRole("timer")).toHaveTextContent("Ships in 2h 0m");
  });

  it("counts down once per second", () => {
    render(<SLATimer deadline={inMs(90_000)} />);

    expect(screen.getByRole("timer")).toHaveTextContent("1m 30s");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("1m 29s");
  });

  it("switches to the warning state under warnUnderMinutes", () => {
    render(<SLATimer deadline={inMs(4 * 60_000)} warnUnderMinutes={5} />);

    const timer = screen.getByRole("timer");
    expect(timer).toHaveClass("text-amber-600");
    expect(timer).toHaveAttribute("aria-live", "assertive");
  });

  it("flips to Overdue once the deadline passes", () => {
    render(<SLATimer deadline={inMs(1000)} />);

    expect(screen.getByRole("timer")).toHaveTextContent("1s");

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("Overdue");
    expect(timer).toHaveClass("text-danger");
    expect(timer).toHaveAttribute("aria-live", "assertive");
  });

  it("clears its interval on unmount", () => {
    const { unmount } = render(<SLATimer deadline={inMs(60_000)} />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
