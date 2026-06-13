"use client";

import { ShoppingCart, Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { cn, formatPrice } from "@/lib/utils";
import type { Product } from "@/types/api";

interface ProductCardProps {
  product: Product;
  onAddToCart?: (product: Product) => void;
  className?: string;
}

function stockBadge(qty: number): { label: string; tone: string } {
  if (qty <= 0) return { label: "Out of stock", tone: "bg-danger text-danger-foreground" };
  if (qty <= 5) return { label: "Low stock", tone: "bg-accent text-accent-foreground" };
  return { label: "In stock", tone: "bg-muted text-muted-foreground" };
}

export function ProductCard({ product, onAddToCart, className }: ProductCardProps) {
  const badge = stockBadge(product.stock_qty);
  const outOfStock = product.stock_qty <= 0;
  const cover = product.images[0];

  return (
    <article
      className={cn(
        "group flex flex-col gap-3 rounded-lg border border-border bg-background p-4",
        "transition-shadow focus-within:shadow-md hover:shadow-md",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
        {cover ? (
          // Plain <img> until next/image is wired with the actual image origin.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground" aria-hidden="true">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        <span
          className={cn(
            "absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium",
            badge.tone,
          )}
        >
          {badge.label}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {product.title}
        </h3>
        <p className="text-base font-semibold text-foreground tabular-nums">
          {formatPrice(product.price)}
        </p>
      </div>

      <Button
        variant="primary"
        size="sm"
        leftIcon={<ShoppingCart className="h-4 w-4" aria-hidden="true" />}
        onClick={() => onAddToCart?.(product)}
        disabled={outOfStock}
        aria-label={`Add ${product.title} to cart`}
        className="mt-auto"
      >
        {outOfStock ? "Out of stock" : "Add to cart"}
      </Button>
    </article>
  );
}
