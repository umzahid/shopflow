import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Hoisted mocks — declared before importing the SUT.
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const product = (id: string, title: string, price: string, stock: number) => ({
  id,
  merchant_id: "m-1",
  category_id: null,
  title,
  description: "",
  price,
  stock_qty: stock,
  images: [],
  status: "active" as const,
  created_at: new Date().toISOString(),
});

const PRODUCTS = [
  product("p-1", "Ceramic Mug", "18.50", 12),
  product("p-2", "Leather Bag", "89.00", 3),
  product("p-3", "Candle Set", "24.00", 40),
];

vi.mock("@/lib/merchant", () => ({
  merchantKeys: { all: ["merchant"] },
  useMerchantProducts: () => ({
    data: { items: PRODUCTS, next_cursor: null },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useUpdateProduct: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useProductForecast: () => ({ data: undefined, isLoading: false }),
  useGenerateDescription: () => ({ mutate: vi.fn(), isPending: false }),
}));

import ProductManagerPage from "@/app/merchant/products/page";

const rowTitles = () => {
  const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row").slice(1); // drop header
  return rows.map((r) => within(r).getAllByRole("cell")[1].textContent ?? "");
};

describe("Product manager — search & column sort (PRD §2.3)", () => {
  it("filters rows by title through the search box", async () => {
    const user = userEvent.setup();
    render(<ProductManagerPage />);

    await user.type(screen.getByRole("searchbox", { name: /search products/i }), "mug");

    expect(screen.getByText("Ceramic Mug")).toBeInTheDocument();
    expect(screen.queryByText("Leather Bag")).not.toBeInTheDocument();
    expect(screen.queryByText("Candle Set")).not.toBeInTheDocument();
  });

  it("sorts by price when the Price header is clicked, and reverses on second click", async () => {
    const user = userEvent.setup();
    render(<ProductManagerPage />);

    await user.click(screen.getByRole("button", { name: /sort by price/i }));
    expect(rowTitles().map((t) => t.trim())).toEqual([
      expect.stringContaining("Ceramic Mug"),
      expect.stringContaining("Candle Set"),
      expect.stringContaining("Leather Bag"),
    ]); // 18.50 < 24.00 < 89.00

    await user.click(screen.getByRole("button", { name: /sort by price/i }));
    expect(rowTitles()[0]).toContain("Leather Bag"); // descending
  });

  it("sorts by stock when the Stock header is clicked", async () => {
    const user = userEvent.setup();
    render(<ProductManagerPage />);

    await user.click(screen.getByRole("button", { name: /sort by stock/i }));
    expect(rowTitles()[0]).toContain("Leather Bag"); // stock 3 first (ascending)
  });
});
