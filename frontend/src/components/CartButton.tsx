"use client";

import { ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";

import { CartDrawer } from "@/components/CartDrawer";
import { useCartCount } from "@/store/cart";

export function CartButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const count = useCartCount();

  // Wait until after hydration to show the count — Zustand persist
  // hydrates client-side, so SSR vs first-paint can disagree.
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          mounted && count > 0
            ? `Open cart (${count} ${count === 1 ? "item" : "items"})`
            : "Open cart"
        }
        className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ShoppingCart className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
        {mounted && count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground tabular-nums"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
