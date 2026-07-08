import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WeeklyNarrativeCard } from "./WeeklyNarrativeCard";

const mutate = vi.fn();
let state: {
  mutate: typeof mutate;
  data?: unknown;
  isPending: boolean;
  error?: Error | null;
} = { mutate, isPending: false, data: undefined, error: null };

vi.mock("@/lib/merchant", () => ({
  useWeeklyNarrative: () => state,
}));

describe("WeeklyNarrativeCard", () => {
  it("shows the generate button when idle", () => {
    state = { mutate, isPending: false, data: undefined, error: null };
    render(<WeeklyNarrativeCard />);
    expect(screen.getByRole("button", { name: /generate weekly summary/i })).toBeInTheDocument();
  });

  it("shows a loading state while pending", () => {
    state = { mutate, isPending: true, data: undefined, error: null };
    render(<WeeklyNarrativeCard />);
    expect(screen.getByTestId("narrative-loading")).toBeInTheDocument();
  });

  it("renders narrative and highlights when loaded", () => {
    state = {
      mutate,
      isPending: false,
      error: null,
      data: {
        narrative: "Revenue rose 12%.",
        highlights: ["Revenue: $4320", "2 products low on stock"],
        generated_at: new Date().toISOString(),
        cached: false,
      },
    };
    render(<WeeklyNarrativeCard />);
    expect(screen.getByText("Revenue rose 12%.")).toBeInTheDocument();
    expect(screen.getByText("2 products low on stock")).toBeInTheDocument();
  });

  it("fires the mutation on click", async () => {
    state = { mutate, isPending: false, data: undefined, error: null };
    render(<WeeklyNarrativeCard />);
    await userEvent.click(screen.getByRole("button", { name: /generate weekly summary/i }));
    expect(mutate).toHaveBeenCalled();
  });
});
