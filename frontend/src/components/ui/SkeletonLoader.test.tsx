import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductCardSkeletonGrid, Skeleton } from "./SkeletonLoader";

describe("Skeleton", () => {
  it("is hidden from assistive tech by default", () => {
    const { container } = render(<Skeleton />);

    const skeleton = container.firstElementChild;
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton).not.toHaveAttribute("role");
    expect(skeleton).toHaveClass("animate-pulse", "h-4", "w-full");
  });

  it("applies the variant sizing classes", () => {
    const { container: card } = render(<Skeleton variant="card" />);
    expect(card.firstElementChild).toHaveClass("h-72", "rounded-lg");

    const { container: thumb } = render(<Skeleton variant="thumb" />);
    expect(thumb.firstElementChild).toHaveClass("h-12", "w-12", "rounded-md");
  });

  it("merges a custom className", () => {
    const { container } = render(<Skeleton variant="card" className="h-44" />);

    expect(container.firstElementChild).toHaveClass("h-44", "animate-pulse");
  });

  it("announces itself as a loading status when announce is set", () => {
    render(<Skeleton announce />);

    const skeleton = screen.getByRole("status", { name: "Loading" });
    expect(skeleton).not.toHaveAttribute("aria-hidden");
  });
});

describe("ProductCardSkeletonGrid", () => {
  it("announces that products are loading", () => {
    render(<ProductCardSkeletonGrid />);

    expect(
      screen.getByRole("status", { name: "Loading products" }),
    ).toBeInTheDocument();
  });

  it("renders the requested number of skeleton cards", () => {
    render(<ProductCardSkeletonGrid count={3} />);

    const grid = screen.getByRole("status", { name: "Loading products" });
    expect(grid.children).toHaveLength(3);
  });

  it("defaults to eight skeleton cards", () => {
    render(<ProductCardSkeletonGrid />);

    const grid = screen.getByRole("status", { name: "Loading products" });
    expect(grid.children).toHaveLength(8);
  });
});
