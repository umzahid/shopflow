import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Hoisted mocks — declared before importing the SUT.
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const ORDER = {
  id: "ord-12345678-abcd",
  customer_id: "cust-1",
  status: "shipped",
  total_amount: "37.00",
  shipping_address: {
    line1: "1 Test St",
    line2: null,
    city: "Karachi",
    state: null,
    postal_code: "74000",
    country: "PK",
  },
  created_at: new Date().toISOString(),
  items: [
    { id: "item-1", product_id: "prod-12345678", quantity: 2, unit_price: "18.50" },
  ],
  fraud_score: null,
  fraud_reasons: null,
};

vi.mock("@/lib/merchant", () => ({
  useMerchantOrders: () => ({
    data: { items: [ORDER], next_cursor: null },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useUpdateOrderStatus: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/lib/queries", () => ({
  useOrderTracking: () => ({
    data: {
      carrier: "ShopFlow Express",
      tracking_number: "SF-TRACK-001",
      estimated_delivery: null,
      timeline: [
        { status: "pending", label: "Order placed", reached: true, timestamp: new Date().toISOString() },
        { status: "confirmed", label: "Payment confirmed", reached: true, timestamp: null },
        { status: "shipped", label: "Shipped", reached: true, timestamp: null },
        { status: "delivered", label: "Delivered", reached: false, timestamp: null },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

import MerchantOrdersPage from "@/app/merchant/orders/page";

describe("Merchant order detail drawer — timeline (PRD §2.3)", () => {
  it("shows the order status timeline inside the detail drawer", async () => {
    const user = userEvent.setup();
    render(<MerchantOrdersPage />);

    await user.click(screen.getByRole("button", { name: /view/i }));

    // Drawer is open with the order detail; the timeline renders its stages
    // and carrier line from GET /orders/:id/tracking.
    expect(await screen.findByText("Order placed")).toBeInTheDocument();
    expect(screen.getByText("Payment confirmed")).toBeInTheDocument();
    expect(screen.getByText("ShopFlow Express")).toBeInTheDocument();
  });
});
