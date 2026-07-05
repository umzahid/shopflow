import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders the humanized status label", () => {
    render(<StatusBadge status="pending_review" />);
    expect(screen.getByText("pending review")).toBeInTheDocument();
  });

  it("renders each order status", () => {
    const statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"] as const;
    for (const s of statuses) {
      const { unmount } = render(<StatusBadge status={s} />);
      expect(screen.getByText(s)).toBeInTheDocument();
      unmount();
    }
  });
});
