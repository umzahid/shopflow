"use client";

import {
  ChevronRight,
  ImageOff,
  Lock,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useCart, useCartCount, useCartLines, useCartSubtotal } from "@/store/cart";
import { cn, formatPrice } from "@/lib/utils";

export default function CartPage() {
  const lines = useCartLines();
  const subtotal = useCartSubtotal();
  const count = useCartCount();
  const { setQty, remove, clear } = useCart.getState();
  const { toast } = useToast();
  const router = useRouter();

  // Wait until after hydration to read persisted cart — otherwise SSR shows
  // empty cart and client paints filled cart, which counts as content jump.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [coupon, setCoupon] = useState("");

  const handleCheckout = () => {
    // The /checkout route applies coupon + shipping + AuthGuard. Carry the
    // coupon through via querystring so the form pre-fills.
    const url = coupon.trim()
      ? `/checkout?coupon=${encodeURIComponent(coupon.trim())}`
      : "/checkout";
    router.push(url);
  };

  const handleApplyCoupon = () => {
    if (!coupon.trim()) return;
    toast({
      title: "Coupon saved",
      description: `"${coupon}" will be applied at checkout.`,
      variant: "info",
    });
  };

  const isEmpty = mounted && lines.length === 0;
  const showItems = mounted && lines.length > 0;

  return (
    <>
      <Header />
      <main
        id="main"
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
      >
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>
              <Link
                href="/"
                className="rounded font-medium hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Home
              </Link>
            </li>
            <ChevronRight className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            <li aria-current="page" className="font-medium text-foreground">
              Cart
            </li>
          </ol>
        </nav>

        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
            Your cart
          </h1>
          {showItems && (
            <p
              className="text-sm font-medium text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {count} {count === 1 ? "item" : "items"}
            </p>
          )}
        </div>

        {/* Empty state — also covers pre-hydration */}
        {(isEmpty || !mounted) && (
          <EmptyCart hydrating={!mounted} />
        )}

        {showItems && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_22rem]">
            {/* ── Line items ─────────────────────────────────────────── */}
            <section aria-labelledby="items-title" className="flex flex-col gap-4">
              <h2 id="items-title" className="sr-only">
                Items in your cart
              </h2>

              <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-token-sm">
                {lines.map((line) => {
                  const lineTotal = Number(line.unitPrice) * line.qty;
                  const atCap = line.qty >= line.stockQty;
                  return (
                    <li
                      key={line.productId}
                      className="flex gap-4 p-4 sm:p-5"
                    >
                      <Link
                        href={`/products/${line.productId}`}
                        aria-label={`View ${line.title}`}
                        className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:h-28 sm:w-28"
                      >
                        {line.imageUrl ? (
                          <Image
                            src={line.imageUrl}
                            alt=""
                            fill
                            sizes="112px"
                            className="object-cover"
                          />
                        ) : (
                          <ImageOff
                            className="h-8 w-8 text-muted-foreground"
                            aria-hidden="true"
                            strokeWidth={1.5}
                          />
                        )}
                      </Link>

                      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-col gap-1">
                            <Link
                              href={`/products/${line.productId}`}
                              className="line-clamp-2 rounded font-heading text-sm font-semibold text-foreground hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:text-base"
                            >
                              {line.title}
                            </Link>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {formatPrice(line.unitPrice)} each
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(line.productId)}
                            aria-label={`Remove ${line.title} from cart`}
                            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          >
                            <Trash2
                              className="h-4 w-4"
                              aria-hidden="true"
                              strokeWidth={2}
                            />
                          </button>
                        </div>

                        <div className="flex items-end justify-between gap-3">
                          {/* Qty stepper — labelled group, +/- buttons each
                              ≥36px, central value is aria-live polite. */}
                          <div
                            role="group"
                            aria-label={`Quantity for ${line.title}`}
                            className="inline-flex h-10 items-center rounded-md border border-border bg-background"
                          >
                            <button
                              type="button"
                              onClick={() => setQty(line.productId, line.qty - 1)}
                              aria-label={`Decrease quantity of ${line.title}`}
                              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                            >
                              <Minus
                                className="h-4 w-4"
                                aria-hidden="true"
                                strokeWidth={2.5}
                              />
                            </button>
                            <span
                              aria-live="polite"
                              className="inline-flex h-10 w-11 items-center justify-center border-x border-border text-sm font-semibold tabular-nums"
                            >
                              {line.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => setQty(line.productId, line.qty + 1)}
                              disabled={atCap}
                              aria-label={`Increase quantity of ${line.title}`}
                              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Plus
                                className="h-4 w-4"
                                aria-hidden="true"
                                strokeWidth={2.5}
                              />
                            </button>
                          </div>
                          <p className="font-heading text-base font-bold tabular-nums text-foreground sm:text-lg">
                            {formatPrice(lineTotal)}
                          </p>
                        </div>
                        {atCap && (
                          <p className="text-xs text-muted-foreground">
                            Max available for this seller.
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Continue shopping + clear cart */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href="/"
                  className="inline-flex h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <ChevronRight
                    className="h-4 w-4 rotate-180"
                    aria-hidden="true"
                    strokeWidth={2}
                  />
                  Continue shopping
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    clear();
                    toast({
                      title: "Cart cleared",
                      variant: "info",
                    });
                  }}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Trash2
                    className="h-4 w-4"
                    aria-hidden="true"
                    strokeWidth={2}
                  />
                  Clear cart
                </button>
              </div>
            </section>

            {/* ── Order summary (sticky on desktop) ──────────────────── */}
            <aside aria-labelledby="summary-title" className="lg:sticky lg:top-20 lg:self-start">
              <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-token sm:p-6">
                <h2
                  id="summary-title"
                  className="font-heading text-lg font-bold text-foreground"
                >
                  Order summary
                </h2>

                {/* Coupon row — wired to a placeholder toast until /checkout
                    routes through the backend's atomic coupon endpoint. */}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="coupon"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Promo code
                  </label>
                  <div className="flex items-stretch gap-2">
                    <div className="relative flex-1">
                      <Tag
                        aria-hidden="true"
                        strokeWidth={2}
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        id="coupon"
                        type="text"
                        autoComplete="off"
                        value={coupon}
                        onChange={(e) => setCoupon(e.target.value)}
                        placeholder="Enter code"
                        className={cn(
                          "h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm font-medium uppercase tracking-wide",
                          "text-foreground placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground",
                          "transition-colors focus:outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20",
                        )}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleApplyCoupon}
                      disabled={!coupon.trim()}
                    >
                      Apply
                    </Button>
                  </div>
                </div>

                {/* Totals */}
                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex items-baseline justify-between">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {formatPrice(subtotal)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <dt className="text-muted-foreground">Shipping</dt>
                    <dd className="text-xs italic text-muted-foreground">
                      Calculated at checkout
                    </dd>
                  </div>
                  <div className="my-1 h-px bg-border" aria-hidden="true" />
                  <div className="flex items-baseline justify-between">
                    <dt className="font-heading text-base font-bold text-foreground">
                      Total
                    </dt>
                    <dd
                      className="font-heading text-xl font-bold tabular-nums text-foreground"
                      aria-live="polite"
                    >
                      {formatPrice(subtotal)}
                    </dd>
                  </div>
                </dl>

                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleCheckout}
                  className="w-full"
                  rightIcon={
                    <ChevronRight
                      className="h-5 w-5"
                      aria-hidden="true"
                      strokeWidth={2.5}
                    />
                  }
                >
                  Proceed to checkout
                </Button>

                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Lock
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                    strokeWidth={2}
                  />
                  Secure 256-bit encrypted checkout
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function EmptyCart({ hydrating }: { hydrating: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-token-sm">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <ShoppingBag className="h-8 w-8" strokeWidth={1.5} />
      </span>
      <h2 className="font-heading text-xl font-bold text-foreground">
        {hydrating ? "Loading your cart…" : "Your cart is empty"}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {hydrating
          ? "Hold on while we restore your saved items."
          : "Browse the marketplace and add a few things you'd love to receive."}
      </p>
      {!hydrating && (
        <Link
          href="/"
          className="mt-2 inline-flex h-11 cursor-pointer items-center rounded-lg bg-primary px-5 font-heading text-sm font-bold text-primary-foreground shadow-token transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Browse products
        </Link>
      )}
    </div>
  );
}
