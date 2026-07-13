import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the streaming client. vi.hoisted ensures the fn is initialized before
// the hoisted vi.mock factory runs.
const { streamCopilot } = vi.hoisted(() => ({ streamCopilot: vi.fn() }));
vi.mock("@/lib/merchant", () => ({ streamCopilot }));

import { MerchantCopilot } from "./MerchantCopilot";

describe("MerchantCopilot (streaming)", () => {
  beforeEach(() => {
    streamCopilot.mockReset();
    sessionStorage.clear();
    // jsdom doesn't implement Element.scrollTo (the panel auto-scrolls on new messages).
    Element.prototype.scrollTo = vi.fn();
  });

  it("renders streamed answer chunks incrementally and shows the tools used", async () => {
    // Emit the answer in two chunks, then resolve with the tools used.
    streamCopilot.mockImplementation(async (_q: string, onDelta: (t: string) => void) => {
      onDelta("Your revenue ");
      onDelta("was $40.00.");
      return ["get_revenue_summary"];
    });

    const user = userEvent.setup();
    render(<MerchantCopilot />);

    await user.click(screen.getByRole("button", { name: "Open Merchant Copilot" }));
    await user.click(
      screen.getByRole("button", { name: "What was my revenue in the last 30 days?" }),
    );

    expect(streamCopilot).toHaveBeenCalledWith(
      "What was my revenue in the last 30 days?",
      expect.any(Function),
    );
    await waitFor(() =>
      expect(screen.getByText("Your revenue was $40.00.")).toBeInTheDocument(),
    );
    expect(screen.getByText("via get_revenue_summary")).toBeInTheDocument();
  });

  it("shows the server's error detail when the stream fails", async () => {
    streamCopilot.mockRejectedValue(new Error("The assistant is temporarily unavailable."));

    const user = userEvent.setup();
    render(<MerchantCopilot />);
    await user.click(screen.getByRole("button", { name: "Open Merchant Copilot" }));
    await user.click(
      screen.getByRole("button", { name: "Which products are my top sellers?" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Sorry — The assistant is temporarily unavailable."),
      ).toBeInTheDocument(),
    );
  });
});
