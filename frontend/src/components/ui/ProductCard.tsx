"use client";

import { ShoppingCart, Image as ImageIcon, Star } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { cn, formatPrice } from "@/lib/utils";
import type { Product } from "@/types/api";

interface ProductCardProps {
  product: Product;
  onAddToCart?: (product: Product) => void;
  className?: string;
}

function stockBadge(qty: number): { label: string; tone: string } {
  // Stock state uses semantic color + text label so it's never color-only meaning.
  if (qty <= 0)
    return { label: "Sold out", tone: "bg-danger text-danger-foreground" };
  if (qty <= 5)
    return { label: "Low stock", tone: "bg-accent text-accent-foreground" };
  return { label: "In stock", tone: "bg-secondary/10 text-secondary" };
}

export function ProductCard({ product, onAddToCart, className }: ProductCardProps) {
  const badge = stockBadge(product.stock_qty);
  const outOfStock = product.stock_qty <= 0;
  const cover = product.images[0];

  return (
    <article
      className={cn(
        // Lift on hover via translateY + shadow — does NOT shift sibling layout
        // (the card occupies a fixed grid cell), so safe per "layout-shifting hovers" rule.
        "group flex flex-col gap-3 rounded-xl border border-border bg-surface p-4",
        "shadow-token transition-[box-shadow,transform]",
        "hover:shadow-token-lg hover:-translate-y-0.5",
        "motion-reduce:transition-none motion-reduce:hover:transform-none",
        "focus-within:shadow-token-lg",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={product.title}
            loading="lazy"
            // scale-105 lives inside overflow-hidden — no layout shift outside the frame
            className="h-full w-full object-cover transition-transform group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-muted-foreground"
            aria-hidden="true"
          >
            <ImageIcon className="h-10 w-10" strokeWidth={1.5} />
          </div>
        )}
        <span
          className={cn(
            "absolute right-2 top-2 rounded-full px-2.5 py-1 text-xs font-semibold",
            badge.tone,
          )}
        >
          {badge.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <h3 className="line-clamp-2 font-heading text-sm font-medium leading-snug text-foreground">
          {product.title}
        </h3>
        {/* Rating placeholder until reviews API is wired client-side. Stars
            convey shape, not just color, satisfying color-not-only rule. */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-hidden="true" strokeWidth={1.5} />
          <span className="font-medium tabular-nums">—</span>
          <span aria-hidden="true">·</span>
          <span>New listing</span>
        </div>
        <p className="font-heading text-lg font-bold tabular-nums text-foreground">
          {formatPrice(product.price)}
        </p>
      </div>

      <Button
        variant="primary"
        size="sm"
        leftIcon={<ShoppingCart className="h-4 w-4" aria-hidden="true" strokeWidth={2} />}
        onClick={() => onAddToCart?.(product)}
        disabled={outOfStock}
        aria-label={`Add ${product.title} to cart`}
        className="w-full"
      >
        {outOfStock ? "Sold out" : "Add to cart"}
      </Button>
    </article>
  );
}
