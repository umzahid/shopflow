"use client";

import { CheckCircle2, ChevronRight, Package } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { AuthGuard } from "@/components/AuthGuard";
import { Header } from "@/components/Header";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { ApiError } from "@/lib/api";
import { useOrder } from "@/lib/queries";
import { cn, formatPrice } from "@/lib/utils";
import type { OrderStatus } from "@/types/api";

const STATUS_STYLES: Record<OrderStatus, { tone: string; label: string }> = {
  pending: { tone: "bg-muted text-muted-foreground", label: "Pending" },
  pending_review: {
    tone: "bg-accent text-accent-foreground",
    label: "Under review",
  },
  confirmed: { tone: "bg-secondary text-secondary-foreground", label: "Confirmed" },
  shipped: { tone: "bg-primary text-primary-foreground", label: "Shipped" },
  delivered: { tone: "bg-primary text-primary-foreground", label: "Delivered" },
  cancelled: { tone: "bg-danger text-danger-foreground", label: "Cancelled" },
};

export default function OrderDetailPage() {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <AuthGuard>
          <OrderContent />
        </AuthGuard>
      </main>
    </>
  );
}

function OrderContent() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, isError, error } = useOrder(id);
  const problem = isError && error instanceof ApiError ? error.problem : undefined;

  return (
    <>
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
            Order
          </li>
        </ol>
      </nav>

      {isLoading && <OrderSkeleton />}

      {isError && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-6">
          <p className="font-heading font-semibold text-foreground">
            Couldn&apos;t load this order
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {problem?.detail ?? error?.message ?? "Unknown error"}
          </p>
        </div>
      )}

      {order && (
        <>
          {/* Success hero */}
          <div className="mb-6 flex flex-col items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-6">
            <CheckCircle2
              className="h-10 w-10 text-primary"
              aria-hidden="true"
              strokeWidth={2}
            />
            <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
              Thanks — your order is in.
            </h1>
            <p className="text-sm text-muted-foreground">
              Order ID{" "}
              <span className="font-mono text-foreground">{order.id}</span>
            </p>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
                STATUS_STYLES[order.status].tone,
              )}
            >
              {STATUS_STYLES[order.status].label}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Items */}
            <section
              aria-labelledby="items-title"
              className="rounded-xl border border-border bg-surface p-5 shadow-token-sm"
            >
              <h2
                id="items-title"
                className="mb-4 flex items-center gap-2 font-heading text-base font-bold text-foreground"
              >
                <Package className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
                Items
              </h2>
              <ul className="flex flex-col divide-y divide-border text-sm">
                {order.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-baseline justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${item.product_id}`}
                        className="line-clamp-1 rounded font-medium text-foreground hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      >
                        Item #{item.product_id.slice(0, 8)}
                      </Link>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Qty {item.quantity} × {formatPrice(item.unit_price)}
                      </p>
                    </div>
                    <p className="font-heading text-sm font-bold tabular-nums text-foreground">
                      {formatPrice(Number(item.unit_price) * item.quantity)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            {/* Summary + shipping */}
            <section
              aria-labelledby="summary-title"
              className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-token-sm"
            >
              <div>
                <h2
                  id="summary-title"
                  className="mb-3 font-heading text-base font-bold text-foreground"
                >
                  Shipping to
                </h2>
                <address className="not-italic text-sm leading-relaxed text-foreground">
                  {order.shipping_address.line1}
                  {order.shipping_address.line2 && (
                    <>
                      <br />
                      {order.shipping_address.line2}
                    </>
                  )}
                  <br />
                  {order.shipping_address.city}
                  {order.shipping_address.state &&
                    `, ${order.shipping_address.state}`}{" "}
                  {order.shipping_address.postal_code}
                  <br />
                  {order.shipping_address.country}
                </address>
              </div>
              <dl className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
                {Number(order.discount_amount) > 0 && (
                  <div className="flex items-baseline justify-between text-primary">
                    <dt>Discount</dt>
                    <dd className="font-semibold tabular-nums">
                      − {formatPrice(order.discount_amount)}
                    </dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between">
                  <dt className="font-heading text-base font-bold text-foreground">
                    Total paid
                  </dt>
                  <dd className="font-heading text-xl font-bold tabular-nums text-foreground">
                    {formatPrice(order.total_amount)}
                  </dd>
                </div>
              </dl>
              <Link
                href="/"
                className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg border-2 border-secondary px-5 font-heading text-sm font-semibold text-secondary transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Continue shopping
              </Link>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function OrderSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton variant="blank" className="h-32 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Skeleton variant="blank" className="h-48 w-full rounded-xl" />
        <Skeleton variant="blank" className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}
