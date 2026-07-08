"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Drawer } from "@/components/ui/Drawer";
import { useCart, useCartLines, useCartSubtotal } from "@/store/cart";
import { formatPrice } from "@/lib/utils";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const lines = useCartLines();
  const subtotal = useCartSubtotal();
  const { setQty, remove } = useCart.getState();

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Your cart"
      footer={
        lines.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="font-heading text-lg font-bold tabular-nums text-foreground">
                {formatPrice(subtotal)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Shipping &amp; taxes calculated at checkout.
            </p>
            <Link
              href="/cart"
              onClick={onClose}
              className="group inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-6 font-heading text-base font-bold text-primary-foreground shadow-token transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Go to checkout
            </Link>
          </div>
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
          <ShoppingBag
            className="h-10 w-10 text-muted-foreground"
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <p className="font-heading text-base font-semibold text-foreground">
            Your cart is empty
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Browse the marketplace and add a few things you love.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {lines.map((line) => {
            const lineTotal = Number(line.unitPrice) * line.qty;
            const atCap = line.qty >= line.stockQty;
            return (
              <li key={line.productId} className="flex gap-3 py-4">
                <div
                  aria-hidden="true"
                  className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
                >
                  {line.imageUrl ? (
                    <Image
                      src={line.imageUrl}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <ShoppingBag
                      className="h-6 w-6 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium text-foreground">
                      {line.title}
                    </p>
                    <button
                      type="button"
                      onClick={() => remove(line.productId)}
                      aria-label={`Remove ${line.title} from cart`}
                      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => setQty(line.productId, line.qty - 1)}
                        aria-label={`Decrease ${line.title} quantity`}
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      >
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.5} />
                      </button>
                      <span
                        aria-live="polite"
                        className="inline-flex h-8 w-10 items-center justify-center border-x border-border text-sm font-semibold tabular-nums"
                      >
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQty(line.productId, line.qty + 1)}
                        disabled={atCap}
                        aria-label={`Increase ${line.title} quantity`}
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.5} />
                      </button>
                    </div>
                    <span className="font-heading text-sm font-bold tabular-nums text-foreground">
                      {formatPrice(lineTotal)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
