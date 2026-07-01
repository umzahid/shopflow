import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
// These are hoisted by vitest; declare them before importing the SUT.

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/checkout",
}));

// AuthGuard just passes children through — auth is not what we're testing.
vi.mock("@/components/AuthGuard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/Header", () => ({
  Header: () => null,
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Two cart states we'll switch between per test.
let cartLines: Array<{
  productId: string;
  title: string;
  unitPrice: string;
  imageUrl: string | null;
  qty: number;
  stockQty: number;
}> = [];

vi.mock("@/store/cart", () => ({
  useCart: (selector: (s: { clear: () => void }) => unknown) =>
    selector({ clear: vi.fn() }),
  useCartLines: () => cartLines,
  useCartSubtotal: () =>
    cartLines.reduce((s, l) => s + Number(l.unitPrice) * l.qty, 0),
}));

const mockPlaceOrder = vi.fn();
const mockSyncCart = vi.fn();

vi.mock("@/lib/checkout", () => ({
  placeOrder: (...args: unknown[]) => mockPlaceOrder(...args),
  syncCartToServer: (...args: unknown[]) => mockSyncCart(...args),
}));

import CheckoutPage from "@/app/checkout/page";

beforeEach(() => {
  mockReplace.mockReset();
  mockPlaceOrder.mockReset();
  mockSyncCart.mockReset();
  cartLines = [];
});

describe("CheckoutPage", () => {
  it("shows the empty-cart state when there are no lines", async () => {
    cartLines = [];
    render(<CheckoutPage />);
    // The empty branch is only rendered after mount effect runs — findBy waits.
    expect(
      await screen.findByRole("heading", { name: /your cart is empty/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /browse products/i }),
    ).toHaveAttribute("href", "/");
  });

  it("shows validation errors when required fields are blank", async () => {
    const user = userEvent.setup();
    cartLines = [
      {
        productId: "p1",
        title: "Widget",
        unitPrice: "10.00",
        imageUrl: null,
        qty: 1,
        stockQty: 5,
      },
    ];
    render(<CheckoutPage />);

    // Wait for the mounted form to appear
    const submit = await screen.findByRole("button", { name: /place order/i });
    await user.click(submit);

    // Zod schema requires these three at minimum
    expect(await screen.findByText(/street address is required/i)).toBeInTheDocument();
    expect(screen.getByText(/city is required/i)).toBeInTheDocument();
    expect(screen.getByText(/postal code is required/i)).toBeInTheDocument();

    // Nothing should have been submitted upstream
    expect(mockSyncCart).not.toHaveBeenCalled();
    expect(mockPlaceOrder).not.toHaveBeenCalled();
  });

  it("submits the order and navigates to the confirmation page on success", async () => {
    const user = userEvent.setup();
    cartLines = [
      {
        productId: "p1",
        title: "Widget",
        unitPrice: "10.00",
        imageUrl: null,
        qty: 2,
        stockQty: 5,
      },
    ];
    mockSyncCart.mockResolvedValue(undefined);
    mockPlaceOrder.mockResolvedValue({ id: "ord_abc", status: "confirmed" });

    render(<CheckoutPage />);
    await screen.findByRole("button", { name: /place order/i });

    await user.type(screen.getByLabelText(/street address/i), "1 Main St");
    await user.type(screen.getByLabelText(/^city/i), "Karachi");
    await user.type(screen.getByLabelText(/postal code/i), "75500");
    // Country defaults to "PK" — leave it.

    await user.click(screen.getByRole("button", { name: /place order/i }));

    // Wait for the router to be called — that's the end of the happy path.
    await vi.waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/orders/ord_abc");
    });
    expect(mockSyncCart).toHaveBeenCalledTimes(1);
    expect(mockPlaceOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        shipping_address: expect.objectContaining({
          line1: "1 Main St",
          city: "Karachi",
          postal_code: "75500",
          country: "PK",
        }),
      }),
    );
  });
});
