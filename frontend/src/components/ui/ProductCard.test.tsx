import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Product } from "@/types/api";

import { ProductCard } from "./ProductCard";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    merchant_id: "merch-1",
    category_id: null,
    title: "Ergonomic Walnut Desk",
    description: null,
    price: "129.50",
    stock_qty: 12,
    images: ["https://example.com/desk.jpg"],
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProductCard", () => {
  it("renders the title, formatted price, and a link to the product page", () => {
    render(<ProductCard product={makeProduct()} />);

    expect(
      screen.getByRole("link", { name: "Ergonomic Walnut Desk" }),
    ).toHaveAttribute("href", "/products/prod-1");
    expect(
      screen.getByRole("link", { name: "View Ergonomic Walnut Desk" }),
    ).toHaveAttribute("href", "/products/prod-1");
    expect(screen.getByText("$129.50")).toBeInTheDocument();
  });

  it("shows the rating placeholder until reviews are wired up", () => {
    render(<ProductCard product={makeProduct()} />);

    expect(screen.getByText("New listing")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an In stock badge when quantity is healthy", () => {
    render(<ProductCard product={makeProduct({ stock_qty: 12 })} />);

    expect(screen.getByText("In stock")).toBeInTheDocument();
  });

  it("shows a Low stock badge at five or fewer items", () => {
    render(<ProductCard product={makeProduct({ stock_qty: 5 })} />);

    expect(screen.getByText("Low stock")).toBeInTheDocument();
  });

  it("shows Sold out and disables add to cart when out of stock", () => {
    render(<ProductCard product={makeProduct({ stock_qty: 0 })} />);

    const button = screen.getByRole("button", {
      name: "Add Ergonomic Walnut Desk to cart",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Sold out");
    expect(screen.getAllByText("Sold out")).toHaveLength(2); // badge + button
  });

  it("calls onAddToCart with the product from the quick action", async () => {
    const user = userEvent.setup();
    const onAddToCart = vi.fn();
    const product = makeProduct();
    render(<ProductCard product={product} onAddToCart={onAddToCart} />);

    await user.click(
      screen.getByRole("button", { name: "Add Ergonomic Walnut Desk to cart" }),
    );

    expect(onAddToCart).toHaveBeenCalledTimes(1);
    expect(onAddToCart).toHaveBeenCalledWith(product);
  });
});
